import hmac
import hashlib
from urllib.parse import parse_qsl

def verify_init_data(init_data: str, bot_token: str) -> bool:
    """
    Проверка Telegram WebApp initData signature.
    init_data должен быть строкой вида "key1=val1&key2=val2&...&hash=..."
    """
    try:
        if not init_data or not bot_token:
            return False

        # parse_qsl декодирует URL-encoded значения
        pairs = parse_qsl(init_data, keep_blank_values=True)
        data = dict(pairs)

        # hash может называться "hash" (в логах был hash)
        received_hash = data.pop("hash", None)
        if not received_hash:
            # иногда может быть signature — но specs use "hash"
            received_hash = data.pop("signature", None)
        if not received_hash:
            return False

        # build data_check_string: sorted by key name lexicographically
        data_check_list = [f"{k}={v}" for k, v in sorted(data.items())]
        data_check_string = "\n".join(data_check_list)

        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        return hmac.compare_digest(calculated_hash, received_hash)
    except Exception:
        return False
