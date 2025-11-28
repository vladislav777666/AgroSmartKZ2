import hmac, hashlib
from urllib.parse import parse_qsl

def verify_init_data(init_data: str, bot_token: str) -> bool:
    try:
        if not init_data or not bot_token:
            return False
        pairs = parse_qsl(init_data, keep_blank_values=True)
        data = dict(pairs)
        received_hash = data.pop('hash', None) or data.pop('signature', None)
        if not received_hash:
            return False
        data_check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
        secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
        calc = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(calc, received_hash)
    except Exception:
        return False
def parse_init_data(init_data: str) -> dict:
    return dict(parse_qsl(init_data, keep_blank_values=True))