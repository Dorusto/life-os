"""
Settings response tests — the API key's write-only property in particular.

The key can be *set* through PUT /settings but must never come back out of GET
or PUT (plan section 6), so the response-shaping and the configured-vs-not
flag are pinned here. A regression that leaked the key into
``_public_settings()`` would otherwise only be visible by eyeballing JSON.
"""
from app import database, main


def test_public_settings_never_include_api_key(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    # database.get_settings() would happily return the raw row, so the
    # response helper is the one place that has to strip it.
    assert main._market_data_configured() is False

    database.set_setting("twelve_data_api_key", "super-secret")

    assert main._market_data_configured() is True
    settings = main._public_settings()
    assert "twelve_data_api_key" not in settings
    assert "super-secret" not in str(settings)


def test_market_data_configured_falls_back_to_env(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)

    monkeypatch.setenv("TWELVE_DATA_API_KEY", "env-key")
    assert main._market_data_configured() is True
