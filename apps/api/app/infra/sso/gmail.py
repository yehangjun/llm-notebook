from app.infra.sso.base import SSOProvider


class GmailSSOProvider(SSOProvider):
    name = "gmail"

    def build_start_url(self, state: str) -> str:
        return f"/not-implemented?provider={self.name}&state={state}"

    def handle_callback(self, code: str) -> dict:
        return {"provider": self.name, "code": code, "implemented": False}
