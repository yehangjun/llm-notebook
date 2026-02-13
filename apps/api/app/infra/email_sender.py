import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailSender:
    def __init__(self) -> None:
        self.mail_from = settings.mail_from

    def send_register_verification_code(self, to_email: str, code: str) -> None:
        ttl_minutes = max(1, settings.register_email_code_ttl_seconds // 60)
        subject = "Prism 注册邮箱验证码"
        body = (
            "你正在注册 Prism 账号。\n\n"
            f"邮箱验证码：{code}\n"
            f"验证码有效期：{ttl_minutes} 分钟。\n\n"
            "如果不是你本人操作，请忽略此邮件。"
        )

        if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
            logger.info(
                "smtp not configured, skip sending register email code",
                extra={"to": to_email, "code": code},
            )
            return

        self._send_mail(to_email=to_email, subject=subject, body=body)

    def send_password_reset(self, to_email: str, token: str) -> None:
        reset_url = f"{settings.web_base_url}/reset-password?token={token}"
        subject = "Prism 密码重置"
        body = (
            "你收到这封邮件是因为发起了密码重置请求。\n\n"
            f"请点击以下链接完成重置（30分钟有效）：\n{reset_url}\n\n"
            "如果不是你本人操作，请忽略此邮件。"
        )

        if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
            logger.info("smtp not configured, skip sending reset mail", extra={"to": to_email, "reset_url": reset_url})
            return

        self._send_mail(to_email=to_email, subject=subject, body=body)

    def _send_mail(self, *, to_email: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = self.mail_from
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(body)

        if settings.smtp_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as smtp:
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
                smtp.starttls()
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
