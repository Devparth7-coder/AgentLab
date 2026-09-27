from agentlab.providers.base import AgentProvider
from agentlab.providers.http import (
    AnthropicProvider,
    CustomHTTPProvider,
    GeminiProvider,
    HuggingFaceProvider,
    OllamaProvider,
    OpenAIProvider,
)
from agentlab.providers.mock import MockProvider

PROVIDERS: dict[str, type[AgentProvider]] = {
    "mock": MockProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
    "huggingface": HuggingFaceProvider,
    "custom_http": CustomHTTPProvider,
}


def provider_for(name: str) -> AgentProvider:
    if name not in PROVIDERS:
        raise ValueError("Unsupported agent provider")
    return PROVIDERS[name]()
