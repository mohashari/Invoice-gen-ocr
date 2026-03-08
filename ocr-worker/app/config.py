from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_host: str = "redis"
    redis_port: int = 6379
    database_url: str = "postgresql://invoice_user:invoice_pass@postgres:5432/invoice_db"
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str
    s3_secret_key: str
    s3_region: str = "us-east-1"
    s3_bucket_raw: str = "invoices-raw"
    s3_bucket_processed: str = "invoices-processed"
    ocr_worker_callback_url: str = "http://api:3000/internal/ocr-callback"
    internal_api_secret: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
