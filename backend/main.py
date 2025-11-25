import hmac
import hashlib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

BOT_TOKEN = "ТОКЕН_ТВОЕГО_БОТА"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Можно оставить * для локального запуска
    allow_methods=["*"],
    allow_headers=["*"]
)

# Проверка подписи Telegram Mini App
def verify_init_data(init_data: str) -> bool:
    try:
        data_dict = dict(param.split("=") for param in init_data.split("&") if "=" in param)

        received_hash = data_dict.pop("hash")

        sorted_params = sorted([f"{k}={v}" for k, v in data_dict.items()])
        data_check_string = "\n".join(sorted_params)

        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode(),
            hashlib.sha256
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(calculated_hash, received_hash)

    except Exception:
        return False


@app.get("/api/auth")
def auth(initData: str):
    """
    Проверка Telegram WebApp initData
