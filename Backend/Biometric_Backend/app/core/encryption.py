"""
VISION Biometric Backend — Embedding Encryption

Handles AES symmetric encryption of facial embedding vectors at rest.
Implements NFR-SEC-01: biometric data stored as encrypted embeddings,
never raw images used for matching.

Uses Fernet (AES-128-CBC with HMAC-SHA256 for authentication).
"""

import json
import logging
from typing import List

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class EncryptionError(Exception):
    """Raised when encryption or decryption fails."""
    pass


class EmbeddingEncryptor:
    """
    Encrypts and decrypts facial embedding vectors using Fernet symmetric encryption.

    The embedding vector (list of floats) is serialized to JSON, then encrypted.
    This ensures the vector can be perfectly reconstructed on decryption without
    any floating-point precision loss from binary serialization.
    """

    def __init__(self, encryption_key: str):
        """
        Initialize the encryptor with a Fernet key.

        Args:
            encryption_key: A valid Fernet key string. Generate one with:
                python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
        """
        if not encryption_key:
            raise EncryptionError(
                "BIOMETRIC_ENCRYPTION_KEY is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\""
            )

        try:
            self._fernet = Fernet(encryption_key.encode())
        except Exception as e:
            raise EncryptionError(
                f"Invalid encryption key format. Must be a valid Fernet key. Error: {e}"
            )

    def encrypt_embedding(self, embedding: List[float]) -> bytes:
        """
        Encrypt a facial embedding vector.

        Args:
            embedding: List of floats representing the facial embedding
                       (e.g., 2622-dim for VGG-Face).

        Returns:
            Encrypted bytes that can be safely stored on disk.

        Raises:
            EncryptionError: If encryption fails.
        """
        try:
            # Serialize embedding to JSON string, then encode to bytes
            embedding_json = json.dumps(embedding)
            embedding_bytes = embedding_json.encode("utf-8")

            # Encrypt with Fernet (AES + HMAC)
            encrypted = self._fernet.encrypt(embedding_bytes)

            logger.debug(
                f"Encrypted embedding: {len(embedding)} floats -> "
                f"{len(encrypted)} encrypted bytes"
            )
            return encrypted

        except Exception as e:
            raise EncryptionError(f"Failed to encrypt embedding: {e}")

    def decrypt_embedding(self, encrypted_data: bytes) -> List[float]:
        """
        Decrypt an encrypted embedding back to a float vector.

        Args:
            encrypted_data: The encrypted bytes from encrypt_embedding().

        Returns:
            The original embedding as a list of floats.

        Raises:
            EncryptionError: If decryption fails (wrong key, corrupted data, etc.).
        """
        try:
            # Decrypt with Fernet
            decrypted_bytes = self._fernet.decrypt(encrypted_data)

            # Deserialize from JSON
            embedding = json.loads(decrypted_bytes.decode("utf-8"))

            logger.debug(
                f"Decrypted embedding: {len(encrypted_data)} bytes -> "
                f"{len(embedding)} floats"
            )
            return embedding

        except InvalidToken:
            raise EncryptionError(
                "Decryption failed — invalid token. The encryption key may have "
                "changed since this embedding was stored, or the data is corrupted."
            )
        except json.JSONDecodeError as e:
            raise EncryptionError(
                f"Decryption succeeded but deserialization failed: {e}"
            )
        except Exception as e:
            raise EncryptionError(f"Failed to decrypt embedding: {e}")

    @staticmethod
    def generate_key() -> str:
        """
        Generate a new Fernet encryption key.

        Returns:
            A new Fernet key as a string, suitable for BIOMETRIC_ENCRYPTION_KEY.
        """
        return Fernet.generate_key().decode()
