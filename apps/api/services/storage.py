import boto3
import os
import uuid
import logging
from botocore.config import Config

logger = logging.getLogger(__name__)

R2_ACCOUNT_ID = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")
R2_BUCKET     = os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "replate-videos")
R2_PUBLIC_URL = os.getenv("CLOUDFLARE_R2_PUBLIC_URL", "")


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


async def upload_video_to_r2(sop_id: str, video_bytes: bytes, content_type: str = "video/mp4") -> str:
    """Upload SOP recording video to R2. Returns public URL."""
    key = f"sop-recordings/{sop_id}/{uuid.uuid4()}.mp4"

    try:
        client = _get_s3_client()
        client.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=video_bytes,
            ContentType=content_type,
        )
        url = f"{R2_PUBLIC_URL}/{key}" if R2_PUBLIC_URL else f"r2://{R2_BUCKET}/{key}"
        logger.info(f"Uploaded video: {key} ({len(video_bytes) / 1024 / 1024:.1f} MB)")
        return url
    except Exception as e:
        logger.error(f"R2 upload failed: {e}")
        raise


async def upload_frame_to_r2(outlet_id: str, frame_bytes: bytes, timestamp_ms: int) -> str:
    """Upload a single frame (for video clip evidence)."""
    key = f"clips/{outlet_id}/{timestamp_ms}.jpg"
    try:
        client = _get_s3_client()
        client.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=frame_bytes,
            ContentType="image/jpeg",
        )
        return f"{R2_PUBLIC_URL}/{key}" if R2_PUBLIC_URL else f"r2://{R2_BUCKET}/{key}"
    except Exception as e:
        logger.error(f"Frame upload failed: {e}")
        return ""


async def upload_reference_frame(sop_id: str, step_number: int, frame_bytes: bytes) -> str:
    """Upload annotation reference frame for a SOP step."""
    key = f"sop-frames/{sop_id}/step-{step_number}.jpg"
    try:
        client = _get_s3_client()
        client.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=frame_bytes,
            ContentType="image/jpeg",
        )
        return f"{R2_PUBLIC_URL}/{key}" if R2_PUBLIC_URL else key
    except Exception as e:
        logger.error(f"Reference frame upload failed: {e}")
        return ""


def get_presigned_upload_url(key: str, content_type: str, expires: int = 3600) -> str:
    """Generate presigned URL for direct browser → R2 upload."""
    try:
        client = _get_s3_client()
        return client.generate_presigned_url(
            "put_object",
            Params={"Bucket": R2_BUCKET, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )
    except Exception as e:
        logger.error(f"Presigned URL generation failed: {e}")
        return ""
