from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    DoubleType,
    IntegerType,
    TimestampType
)

telemetry_schema = StructType([
    StructField("userId", StringType(), True),
    StructField("videoId", StringType(), True),
    StructField("videoTitle", StringType(), True),
    StructField("city", StringType(), True),
    StructField("isp", StringType(), True),
    StructField("cdn", StringType(), True),            # Cloudflare, Fastly, Akamai, CloudFront
    StructField("device", StringType(), True),         # SmartTV, Mobile, Web, Tablet
    StructField("resolution", StringType(), True),     # 1080p, 4K, 720p, 480p
    StructField("bitrateKbps", IntegerType(), True),
    StructField("bufferingSec", DoubleType(), True),
    StructField("startupLatencyMs", IntegerType(), True), # Time to first frame
    StructField("droppedFrames", IntegerType(), True),
    StructField("timestamp", TimestampType(), True)
])