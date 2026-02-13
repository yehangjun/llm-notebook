from abc import ABC, abstractmethod


class SSOProvider(ABC):
    name: str

    @abstractmethod
    def build_start_url(self, state: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def handle_callback(self, code: str) -> dict:
        raise NotImplementedError
