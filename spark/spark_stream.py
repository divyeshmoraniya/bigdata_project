import os
import sys
import json
from datetime import datetime
import redis
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    from_json, col, window, avg, count, when, coalesce, greatest, least, lit, round as spark_round
)
from schema import telemetry_schema

load_dotenv()

# Hadoop Native Binaries
HADOOP_DIR = r"C:\hadoop"
if os.path.exists(HADOOP_DIR):
    os.environ["HADOOP_HOME"] = HADOOP_DIR
    os.environ["PATH"] = os.path.join(HADOOP_DIR, "bin") + ";" + os.environ.get("PATH", "")

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "127.0.0.1:9092")
REDIS_URI = os.getenv("REDIS_URI", "redis://127.0.0.1:6379")
MONGO_URI = os.getenv("MONGO_URI")

# Initialize Databases
redis_client = redis.from_url(REDIS_URI)
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["test"]
qoe_collection = db["qoe_metrics"]
alerts_collection = db["playback_alerts"]

spark = SparkSession.builder \
    .appName("Video-QoE-Analytics-V2") \
    .config("spark.jars.packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1") \
    .config("spark.sql.shuffle.partitions", "4") \
    .config("spark.sql.adaptive.enabled", "false") \
    .getOrCreate()

spark.sparkContext.setLogLevel("ERROR")

# Kafka Stream Reader
raw_stream = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", KAFKA_BROKER) \
    .option("subscribe", "video-playback-logs") \
    .option("startingOffsets", "latest") \
    .option("failOnDataLoss", "false") \
    .load()

parsed_stream = raw_stream \
    .selectExpr("CAST(value AS STRING) as json_payload") \
    .select(from_json(col("json_payload"), telemetry_schema).alias("d")) \
    .select("d.*") \
    .filter(col("cdn").isNotNull() & col("city").isNotNull() & col("isp").isNotNull()) \
    .withColumn("city", when(col("city") == "Dehli", "Delhi").otherwise(col("city"))) \
    .withColumn("bufferingSec", coalesce(col("bufferingSec"), lit(0.0))) \
    .withColumn("bitrateKbps", coalesce(col("bitrateKbps"), lit(0.0))) \
    .withColumn("startupLatencyMs", coalesce(col("startupLatencyMs"), lit(0.0))) \
    .withColumn("droppedFrames", coalesce(col("droppedFrames"), lit(0.0)))

raw_qoe = (
    lit(100.0) 
    - (col("avgBuffering") * lit(16.0)) 
    - (col("avgDroppedFrames") * lit(0.8)) 
    - (col("avgStartupLatency") / lit(120.0))
)

aggregated_stream = parsed_stream \
    .withWatermark("timestamp", "30 seconds") \
    .groupBy(
        window(col("timestamp"), "1 minute", "10 seconds"),
        col("city"),
        col("isp"),
        col("cdn")
    ) \
    .agg(
        coalesce(spark_round(avg("bufferingSec"), 2), lit(0.0)).alias("avgBuffering"),
        coalesce(spark_round(avg("bitrateKbps"), 0), lit(0.0)).alias("avgBitrate"),
        coalesce(spark_round(avg("startupLatencyMs"), 0), lit(0.0)).alias("avgStartupLatency"),
        coalesce(spark_round(avg("droppedFrames"), 1), lit(0.0)).alias("avgDroppedFrames"),
        count("userId").alias("activeSessions")
    ) \
    .withColumn("qoeScore", spark_round(greatest(lit(0.0), least(lit(100.0), raw_qoe)), 1)) \
    .withColumn("status", when(col("qoeScore") < 70.0, "CRITICAL").when(col("qoeScore") < 85.0, "DEGRADED").otherwise("OPTIMAL"))

def process_batch(df, batch_id):
    records = df.collect()
    if not records:
        return

    print(f"\n⚡ [Batch {batch_id}] Ingesting {len(records)} QoE window segments...")
    mongo_ops = []
    alert_ops = []
    pipe = redis_client.pipeline()

    for row in records:
        data = {
            "city": row["city"],
            "isp": row["isp"],
            "cdn": row["cdn"],
            "avgBuffering": float(row["avgBuffering"] or 0.0),
            "avgBitrate": float(row["avgBitrate"] or 0.0),
            "avgStartupLatency": float(row["avgStartupLatency"] or 0.0),
            "avgDroppedFrames": float(row["avgDroppedFrames"] or 0.0),
            "activeSessions": int(row["activeSessions"] or 0),
            "qoeScore": float(row["qoeScore"] or 100.0),
            "status": row["status"] or "OPTIMAL"
        }

        # Redis hot key
        pipe.set(f"qoe:{data['city']}:{data['isp']}:{data['cdn']}", json.dumps(data), ex=60)

        # MongoDB upsert
        mongo_ops.append(
            UpdateOne(
                {"city": data["city"], "isp": data["isp"], "cdn": data["cdn"]},
                {"$set": data},
                upsert=True
            )
        )

        if data["status"] == "CRITICAL":
            try:
                redis_client.publish("qoe_alerts", json.dumps(data))
            except Exception as e:
                pass
            alert_ops.append(data)

    try:
        pipe.execute()
    except Exception:
        pass

    if mongo_ops:
        try:
            qoe_collection.bulk_write(mongo_ops, ordered=False)
        except Exception:
            pass

    if alert_ops:
        try:
            alerts_collection.insert_many(alert_ops)
        except Exception:
            pass

    print(f"✅ [Batch {batch_id}] Successfully persisted to Redis & MongoDB.")

checkpoint_dir = r"C:\tmp\spark_chk_v6"
query = aggregated_stream.writeStream \
    .foreachBatch(process_batch) \
    .outputMode("update") \
    .option("checkpointLocation", checkpoint_dir) \
    .start()

print("🚀 QoE Intelligence Engine Active. Monitoring live telemetry...")
query.awaitTermination()