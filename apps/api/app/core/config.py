from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = Field(default="llm-notebook", validation_alias="APP_NAME")
    app_env: str = Field(default="dev", validation_alias="APP_ENV")
    app_port: int = Field(default=8000, validation_alias="APP_PORT")

    secret_key: str = Field(default="change-me", validation_alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(
        default=15,
        validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    refresh_token_expire_days: int = Field(default=30, validation_alias="REFRESH_TOKEN_EXPIRE_DAYS")
    reset_token_expire_minutes: int = Field(default=30, validation_alias="RESET_TOKEN_EXPIRE_MINUTES")

    database_url: str = Field(validation_alias="DATABASE_URL")
    redis_url: str = Field(validation_alias="REDIS_URL")

    mail_from: str = Field(default="llm_notebook@163.com", validation_alias="MAIL_FROM")
    smtp_host: str | None = Field(default=None, validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=465, validation_alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, validation_alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, validation_alias="SMTP_PASSWORD")
    smtp_ssl: bool = Field(default=True, validation_alias="SMTP_SSL")

    web_base_url: str = Field(default="http://localhost:3000", validation_alias="WEB_BASE_URL")

    login_fail_threshold: int = Field(default=5, validation_alias="LOGIN_FAIL_THRESHOLD")
    login_fail_ttl_seconds: int = Field(default=900, validation_alias="LOGIN_FAIL_TTL_SECONDS")
    login_lock_ttl_seconds: int = Field(default=900, validation_alias="LOGIN_LOCK_TTL_SECONDS")

    register_limit_per_hour: int = Field(default=20, validation_alias="REGISTER_LIMIT_PER_HOUR")
    forgot_password_cooldown_seconds: int = Field(default=60, validation_alias="FORGOT_PASSWORD_COOLDOWN_SECONDS")

    admin_user_id: str = Field(default="admin", validation_alias="ADMIN_USER_ID")
    admin_email: str = Field(default="admin@llm-notebook.local", validation_alias="ADMIN_EMAIL")
    admin_password: str = Field(default="ChangeMe123!", validation_alias="ADMIN_PASSWORD")
    admin_nickname: str = Field(default="系统管理员", validation_alias="ADMIN_NICKNAME")


settings = Settings()
ALLOWED_UI_LANGUAGES = {"zh-CN", "en-US"}
