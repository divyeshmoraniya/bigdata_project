import os
import sys

# 1. Windows Native Hadoop Configuration
HADOOP_DIR = r"C:\hadoop"
os.environ["HADOOP_HOME"] = HADOOP_DIR
os.environ["hadoop.home.dir"] = HADOOP_DIR
os.environ["PATH"] = os.path.join(HADOOP_DIR, "bin") + ";" + os.environ.get("PATH", "")

import json
from datetime import datetime, timezone
import redis
import clickhouse_connect
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    from_json, col, window, avg, count, when, coalesce, greatest, least, lit, round as spark_round
)
from schema import telemetry_schema

load_dotenv()

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "127.0.0.1:9092")
REDIS_URI = os.getenv("REDIS_URI", "redis://127.0.0.1:6379")
MONGO_URI = os.getenv("MONGO_URI")

# 2. Database Clients Initialization
redis_client = redis.from_url(REDIS_URI)
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["test"]
qoe_collection = db["qoe_metrics"]
alerts_collection = db["playback_alerts"]

# Initialize ClickHouse Client (HTTP Port 8123)
ch_client = clickhouse_connect.get_client(host='localhost', port=8123, username='default', password='')

# 3. Spark Session
spark = SparkSession.builder \
    .appName("Video-QoE-Analytics-V2") \
    .config("spark.jars.packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1") \
    .config("spark.sql.shuffle.partitions", "4") \
    .config("spark.sql.adaptive.enabled", "false") \
    .config("spark.sql.streaming.forceDeleteTempCheckpointLocation", "true") \
    .getOrCreate()

# JVM Hadoop permissions override
hadoop_conf = spark.sparkContext._jsc.hadoopConfiguration()
hadoop_conf.set("fs.file.impl", "org.apache.hadoop.fs.RawLocalFileSystem")
hadoop_conf.setBoolean("fs.file.impl.disable.cache", True)
hadoop_conf.set("fs.permissions.umask-mode", "000")

spark.sparkContext.setLogLevel("ERROR")

# 4. Kafka Stream Reader
raw_stream = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", KAFKA_BROKER) \
    .option("subscribe", "video-playback-logs") \
    .option("startingOffsets", "latest") \
    .option("maxOffsetsPerTrigger", 5000) \
    .load()

# 5. Schema Deserialization, Typo Correction & Null Sanitization
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

# 6. Sliding Window Aggregations (1-minute window, 10s slide)
raw_qoe_calculation = (
    lit(100.0) 
    - (col("avgBuffering") * lit(15.0)) 
    - (col("avgDroppedFrames") * lit(0.8)) 
    - (col("avgStartupLatency") / lit(100.0))
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
    .withColumn(
        "qoeScore",
        spark_round(
            greatest(lit(0.0), least(lit(100.0), raw_qoe_calculation)),
            1
        )
    ) \
    .withColumn(
        "status",
        when(col("qoeScore") < 70.0, "CRITICAL")
        .when(col("qoeScore") < 85.0, "DEGRADED")
        .otherwise("OPTIMAL")
    )

def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

# 7. Multi-Database Micro-Batch Sink
def process_batch(df, batch_id):
    records = df.collect()
    if not records:
        return

    print(f"\n⚡ [Batch {batch_id}] Processing {len(records)} segments across Multi-CDN / ISP topology...")

    mongo_ops = []
    alert_ops = []
    ch_rows = []
    pipe = redis_client.pipeline()

    for row in records:
        # Clamp QoE at Python level as an extra safeguard
        qoe_val = max(0.0, min(100.0, safe_float(row["qoeScore"], 100.0)))

        data = {
            "city": row["city"],
            "isp": row["isp"],
            "cdn": row["cdn"],
            "avgBuffering": safe_float(row["avgBuffering"]),
            "avgBitrate": safe_float(row["avgBitrate"]),
            "avgStartupLatency": safe_float(row["avgStartupLatency"]),
            "avgDroppedFrames": safe_float(row["avgDroppedFrames"]),
            "activeSessions": int(row["activeSessions"] or 0),
            "qoeScore": qoe_val,
            "status": row["status"] or "OPTIMAL",
            "windowStart": str(row["window"]["start"]) if row["window"] else "",
            "windowEnd": str(row["window"]["end"]) if row["window"] else ""
        }

        # 1. Redis State Write
        redis_key = f"qoe:{data['city']}:{data['isp']}:{data['cdn']}"
        pipe.set(redis_key, json.dumps(data), ex=60)

        # 2. MongoDB Upsert
        mongo_ops.append(
            UpdateOne(
                {"city": data["city"], "isp": data["isp"], "cdn": data["cdn"]},
                {"$set": data},
                upsert=True
            )
        )

        # 3. Timestamp conversion for ClickHouse
        window_end_val = row["window"]["end"] if row["window"] else None
        if isinstance(window_end_val, datetime):
            clean_dt = window_end_val
        elif window_end_val:
            clean_ts = str(window_end_val).replace("T", " ").split(".")[0].split("+")[0]
            try:
                clean_dt = datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S")
            except Exception:
                clean_dt = datetime.now()
        else:
            clean_dt = datetime.now()

        # Queue ClickHouse Row
        ch_rows.append([
            clean_dt,
            data["city"],
            data["isp"],
            data["cdn"],
            data["avgBuffering"],
            data["avgBitrate"],
            data["avgStartupLatency"],
            int(data["avgDroppedFrames"]),
            data["qoeScore"],
            "STREAM"
        ])

        # 4. Handle Alerts
        if data["status"] == "CRITICAL":
            print(f"🚨 CRITICAL INCIDENT: [{data['cdn']}] in {data['city']} via {data['isp']} (QoE: {data['qoeScore']}/100, Buffer: {data['avgBuffering']}s)")
            try:
                redis_client.publish("qoe_alerts", json.dumps(data))
            except Exception as pub_err:
                print(f"⚠️ Redis publish warning: {pub_err}")
            alert_ops.append(data.copy())

    # Bulk execute Redis writes
    try:
        pipe.execute()
    except Exception as re_err:
        print(f"⚠️ Redis write warning: {re_err}")

    # Bulk execute MongoDB operations
    if mongo_ops:
        try:
            qoe_collection.bulk_write(mongo_ops, ordered=False)
        except Exception as mg_err:
            print(f"⚠️ MongoDB write warning: {mg_err}")

    # Bulk execute Alert inserts
    if alert_ops:
        try:
            alerts_collection.insert_many(alert_ops)
        except Exception as al_err:
            print(f"⚠️ Alerts write warning: {al_err}")

    # 5. Bulk execute ClickHouse inserts
    if ch_rows:
        try:
            ch_client.insert(
                'video_analytics.qoe_raw_stream',
                ch_rows,
                column_names=[
                    'timestamp', 'city', 'isp', 'cdn',
                    'bufferingSec', 'bitrateKbps', 'startupLatencyMs',
                    'droppedFrames', 'qoeScore', 'sourceType'
                ]
            )
        except Exception as ch_err:
            print(f"⚠️ ClickHouse insert warning: {ch_err}")

    print(f"✅ [Batch {batch_id}] Successfully persisted to Redis, MongoDB & ClickHouse.")

# 8. Start Query Execution
checkpoint_path = r"C:\tmp\spark_chk_v5"

query = aggregated_stream.writeStream \
    .foreachBatch(process_batch) \
    .outputMode("update") \
    .option("checkpointLocation", checkpoint_path) \
    .start()

print("🚀 QoE Intelligence Engine Active. Monitoring live telemetry...")
query.awaitTermination()