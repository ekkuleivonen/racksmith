"""SSH key generation and management."""

from __future__ import annotations

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ssh.misc import _racksmith_ssh_dir


def machine_public_key() -> str:
    ssh_dir = _racksmith_ssh_dir()
    for name in ("id_ed25519.pub", "id_ecdsa.pub", "id_rsa.pub"):
        path = ssh_dir / name
        if path.is_file():
            value = path.read_text(encoding="utf-8").strip()
            if value:
                return value
    raise FileNotFoundError("No public SSH key found. Generate one below.")


def generate_ssh_key_pair() -> str:
    """Generate an Ed25519 key pair in the daemon data dir. Returns the public key."""
    ssh_dir = _racksmith_ssh_dir()
    ssh_dir.mkdir(parents=True, exist_ok=True)
    ssh_dir.chmod(0o700)

    priv_path = ssh_dir / "id_ed25519"
    pub_path = ssh_dir / "id_ed25519.pub"

    if pub_path.is_file():
        return pub_path.read_text(encoding="utf-8").strip()

    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_key = private_key.public_key()
    public_openssh = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    )
    public_str = public_openssh.decode("utf-8") + " racksmith"

    priv_path.write_bytes(private_pem)
    priv_path.chmod(0o600)
    pub_path.write_text(public_str)
    pub_path.chmod(0o644)

    return public_str
