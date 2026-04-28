import pytest

from api.config import Settings, _DEV_SECRET_KEY_DEFAULT, _enforce_production_secret


def _settings(**overrides: object) -> Settings:
    return Settings.model_construct(**{**Settings().model_dump(), **overrides})


def test_dev_default_secret_is_allowed_in_dev() -> None:
    s = _settings(env="dev", secret_key=_DEV_SECRET_KEY_DEFAULT)
    _enforce_production_secret(s)


def test_dev_default_secret_is_allowed_in_test() -> None:
    s = _settings(env="test", secret_key=_DEV_SECRET_KEY_DEFAULT)
    _enforce_production_secret(s)


def test_dev_default_secret_rejected_in_production() -> None:
    s = _settings(env="production", secret_key=_DEV_SECRET_KEY_DEFAULT)
    with pytest.raises(RuntimeError, match="SECRET_KEY must be set"):
        _enforce_production_secret(s)


def test_short_secret_rejected_in_production() -> None:
    s = _settings(env="production", secret_key="x" * 31)
    with pytest.raises(RuntimeError, match="32 chars"):
        _enforce_production_secret(s)


def test_strong_secret_accepted_in_production() -> None:
    s = _settings(env="production", secret_key="x" * 48)
    _enforce_production_secret(s)


def test_unknown_env_treated_as_production() -> None:
    s = _settings(env="staging", secret_key=_DEV_SECRET_KEY_DEFAULT)
    with pytest.raises(RuntimeError):
        _enforce_production_secret(s)
