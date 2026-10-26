"""
Unit tests for encryption, validators, and schema models.
"""

import pytest
from cryptography.fernet import Fernet

from app.core.encryption import EmbeddingEncryptor, EncryptionError
from app.core.validators import (
    ValidationError,
    validate_image_format,
    validate_image_size,
    validate_single_face,
)


def test_encryption_decryption_cycle():
    key = Fernet.generate_key().decode()
    encryptor = EmbeddingEncryptor(key)

    original_embedding = [0.123456, -0.654321, 0.999999, 0.0]

    encrypted_bytes = encryptor.encrypt_embedding(original_embedding)
    assert isinstance(encrypted_bytes, bytes)
    assert len(encrypted_bytes) > 0

    decrypted_embedding = encryptor.decrypt_embedding(encrypted_bytes)
    assert len(decrypted_embedding) == len(original_embedding)
    for orig, dec in zip(original_embedding, decrypted_embedding):
        assert pytest.approx(orig, rel=1e-5) == dec


def test_encryption_invalid_key():
    with pytest.raises(EncryptionError):
        EmbeddingEncryptor("invalid-key-str")


def test_validate_image_format():
    # Valid formats
    validate_image_format("image/jpeg", "test.jpg")
    validate_image_format("image/png", "test.png")

    # Invalid format
    with pytest.raises(ValidationError) as exc_info:
        validate_image_format("image/gif", "test.gif")
    assert exc_info.value.error_code == "INVALID_IMAGE_FORMAT"


def test_validate_image_size():
    # Valid size (1MB against 10MB limit)
    validate_image_size(b"x" * 1024 * 1024, 10 * 1024 * 1024)

    # Invalid size
    with pytest.raises(ValidationError) as exc_info:
        validate_image_size(b"x" * 11 * 1024 * 1024, 10 * 1024 * 1024)
    assert exc_info.value.error_code == "IMAGE_TOO_LARGE"


def test_validate_single_face():
    # Exactly one face
    res = validate_single_face([{"face": "data"}])
    assert res == {"face": "data"}

    # No face
    with pytest.raises(ValidationError) as exc_info:
        validate_single_face([])
    assert exc_info.value.error_code == "NO_FACE_DETECTED"

    # Multiple faces
    with pytest.raises(ValidationError) as exc_info:
        validate_single_face([{"face": "1"}, {"face": "2"}])
    assert exc_info.value.error_code == "MULTIPLE_FACES_DETECTED"
