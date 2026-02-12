from email.message import EmailMessage
import smtplib

from app.core.config import settings


class EmailDeliveryError(RuntimeError):
    pass


def smtp_is_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_username and settings.smtp_password)


def send_login_code_email(recipient_email: str, code: str) -> None:
    if not smtp_is_configured():
        raise EmailDeliveryError('SMTP is not configured')

    subject = f'Your AI Notebook verification code: {code}'
    text_body = (
        'Use this verification code to continue with AI Notebook account authentication.\n\n'
        f'Code: {code}\n'
        f'Expires in: {settings.email_otp_expire_minutes} minutes\n\n'
        'If you did not request this code, please ignore this email.'
    )
    html_body = (
        '<p>Use this verification code to continue with <b>AI Notebook</b> account authentication.</p>'
        f'<p style="font-size:20px"><b>{code}</b></p>'
        f'<p>Expires in {settings.email_otp_expire_minutes} minutes.</p>'
        '<p>If you did not request this code, please ignore this email.</p>'
    )

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f'{settings.smtp_from_name} <{settings.smtp_from_email}>'
    msg['To'] = recipient_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype='html')

    if settings.smtp_use_ssl:
        smtp_client = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
    else:
        smtp_client = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)

    try:
        with smtp_client as server:
            if settings.smtp_use_tls and not settings.smtp_use_ssl:
                server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
    except Exception as exc:  # noqa: BLE001
        raise EmailDeliveryError(f'Email delivery failed: {exc}') from exc


def send_password_reset_email(recipient_email: str, reset_url: str) -> None:
    if not smtp_is_configured():
        raise EmailDeliveryError('SMTP is not configured')

    subject = 'AI Notebook password reset'
    text_body = (
        'Click the link below to reset your password:\n\n'
        f'{reset_url}\n\n'
        'This link expires soon. If you did not request this, ignore this email.'
    )
    html_body = (
        '<p>Click the link below to reset your password:</p>'
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        '<p>This link expires soon. If you did not request this, ignore this email.</p>'
    )

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f'{settings.smtp_from_name} <{settings.smtp_from_email}>'
    msg['To'] = recipient_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype='html')

    if settings.smtp_use_ssl:
        smtp_client = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
    else:
        smtp_client = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)

    try:
        with smtp_client as server:
            if settings.smtp_use_tls and not settings.smtp_use_ssl:
                server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
    except Exception as exc:  # noqa: BLE001
        raise EmailDeliveryError(f'Email delivery failed: {exc}') from exc
