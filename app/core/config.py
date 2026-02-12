from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'ai-notebook-mvp'
    app_env: str = 'dev'
    app_port: int = 8000

    secret_key: str = 'change-me-in-production'
    access_token_expire_minutes: int = 10080
    email_otp_expire_minutes: int = 10
    email_otp_max_attempts: int = 5
    email_debug_code_enabled: bool = True

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_from_email: str = 'no-reply@example.com'
    smtp_from_name: str = 'AI Notebook'

    sso_state_expire_minutes: int = 10
    sso_success_redirect_url: str = 'http://localhost:8000/'
    sso_allowed_redirect_hosts: str = 'localhost,127.0.0.1'

    gmail_oauth_client_id: str | None = None
    gmail_oauth_client_secret: str | None = None
    gmail_oauth_redirect_uri: str = 'http://localhost:8000/auth/sso/gmail/callback'

    wechat_oauth_app_id: str | None = None
    wechat_oauth_app_secret: str | None = None
    wechat_oauth_redirect_uri: str = 'http://localhost:8000/auth/sso/wechat/callback'

    database_url: str = 'postgresql+psycopg://mvp:mvp@db:5432/mvp'
    redis_url: str = 'redis://redis:6379/0'


settings = Settings()
