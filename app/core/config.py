from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'ai-notebook-mvp'
    app_env: str = 'dev'
    app_port: int = 8000

    secret_key: str = 'change-me-in-production'
    access_token_expire_minutes: int = 10080

    database_url: str = 'postgresql+psycopg://mvp:mvp@db:5432/mvp'
    redis_url: str = 'redis://redis:6379/0'


settings = Settings()
