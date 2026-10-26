"""
VISION Biometric Backend — Embedding Store

Abstract interface + file-system implementation for storing encrypted
facial embeddings. Designed to be swapped to PostgreSQL/pgvector or a
dedicated vector database in a later phase without touching the API layer.
"""

import json
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class EmbeddingStoreError(Exception):
    """Raised when storage operations fail."""
    pass


class EmbeddingStore(ABC):
    """
    Abstract base class for embedding storage.

    Implementations must handle encrypted embedding bytes — the store
    never sees or decrypts raw embedding vectors.
    """

    @abstractmethod
    async def store(
        self, user_id: str, encrypted_embedding: bytes, metadata: Optional[dict] = None
    ) -> None:
        """Store an encrypted embedding for a user."""
        ...

    @abstractmethod
    async def retrieve(self, user_id: str) -> Optional[bytes]:
        """Retrieve the encrypted embedding for a user. Returns None if not found."""
        ...

    @abstractmethod
    async def delete(self, user_id: str) -> bool:
        """Delete a user's embedding. Returns True if deleted, False if not found."""
        ...

    @abstractmethod
    async def exists(self, user_id: str) -> bool:
        """Check if a user has a stored embedding."""
        ...

    @abstractmethod
    async def list_all_user_ids(self) -> List[str]:
        """List all user IDs with stored embeddings."""
        ...

    @abstractmethod
    async def retrieve_all(self) -> Dict[str, bytes]:
        """Retrieve all stored embeddings. Returns dict of user_id -> encrypted bytes."""
        ...

    @abstractmethod
    async def get_metadata(self, user_id: str) -> Optional[dict]:
        """Get metadata for a user's embedding (enrolled_at, etc.)."""
        ...

    @abstractmethod
    async def count(self) -> int:
        """Count total stored embeddings."""
        ...


class FileSystemEmbeddingStore(EmbeddingStore):
    """
    File-system based embedding store for the PoC.

    Stores one encrypted embedding file (.bin) and one metadata file (.json)
    per user in the configured directory. Simple, no external dependencies,
    sufficient for a single-gate pilot.

    Directory structure:
        data/embeddings/
        ├── {user_id}.bin      # Encrypted embedding bytes
        ├── {user_id}.json     # Metadata (enrolled_at, etc.)
        ├── archive/
        │   └── {user_id}_{timestamp}.bin  # Archived previous embeddings
    """

    def __init__(self, storage_path: Path):
        """
        Initialize with the directory path for storing embedding files.

        Args:
            storage_path: Absolute path to the embeddings directory.
                          Created automatically if it doesn't exist.
        """
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

        # Archive directory for re-enrollment history
        self.archive_path = self.storage_path / "archive"
        self.archive_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"FileSystemEmbeddingStore initialized at: {self.storage_path}")

    def _safe_path(self, user_id: str, suffix: str) -> Path:
        """
        The file for `user_id`, guaranteed to sit directly inside the store.

        Replacing separators is not enough on Windows: "C:x" joined onto the store path
        becomes a drive-relative path somewhere else entirely. The routes already refuse
        anything but a plain id; this is the check that does not depend on them.
        """
        safe_id = user_id.replace("/", "_").replace("\\", "_").replace("..", "_")
        path = self.storage_path / f"{safe_id}{suffix}"
        if path.resolve().parent != self.storage_path.resolve():
            raise EmbeddingStoreError(f"Refusing a path outside the store for user '{user_id}'")
        return path

    def _embedding_file(self, user_id: str) -> Path:
        """Get the path to a user's embedding file."""
        return self._safe_path(user_id, ".bin")

    def _metadata_file(self, user_id: str) -> Path:
        """Get the path to a user's metadata file."""
        return self._safe_path(user_id, ".json")

    async def store(
        self, user_id: str, encrypted_embedding: bytes, metadata: Optional[dict] = None
    ) -> None:
        """
        Store an encrypted embedding for a user.

        Args:
            user_id: Unique user identifier.
            encrypted_embedding: AES-encrypted embedding bytes.
            metadata: Optional metadata dict (e.g., faces_processed, model_name).
        """
        try:
            embedding_file = self._embedding_file(user_id)
            metadata_file = self._metadata_file(user_id)

            # Write encrypted embedding
            embedding_file.write_bytes(encrypted_embedding)

            # Write metadata
            meta = metadata or {}
            meta["user_id"] = user_id
            meta["enrolled_at"] = datetime.utcnow().isoformat()
            meta["embedding_file"] = embedding_file.name
            metadata_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")

            logger.info(
                f"Stored embedding for user '{user_id}' "
                f"({len(encrypted_embedding)} bytes)"
            )

        except Exception as e:
            raise EmbeddingStoreError(
                f"Failed to store embedding for user '{user_id}': {e}"
            )

    async def retrieve(self, user_id: str) -> Optional[bytes]:
        """Retrieve the encrypted embedding for a user."""
        embedding_file = self._embedding_file(user_id)
        if not embedding_file.exists():
            return None

        try:
            return embedding_file.read_bytes()
        except Exception as e:
            raise EmbeddingStoreError(
                f"Failed to read embedding for user '{user_id}': {e}"
            )

    async def delete(self, user_id: str) -> bool:
        """Delete a user's embedding and metadata."""
        embedding_file = self._embedding_file(user_id)
        metadata_file = self._metadata_file(user_id)

        if not embedding_file.exists():
            return False

        try:
            embedding_file.unlink(missing_ok=True)
            metadata_file.unlink(missing_ok=True)
            logger.info(f"Deleted embedding for user '{user_id}'")
            return True
        except Exception as e:
            raise EmbeddingStoreError(
                f"Failed to delete embedding for user '{user_id}': {e}"
            )

    async def exists(self, user_id: str) -> bool:
        """Check if a user has a stored embedding."""
        return self._embedding_file(user_id).exists()

    async def list_all_user_ids(self) -> List[str]:
        """List all user IDs with stored embeddings."""
        try:
            return [
                f.stem
                for f in self.storage_path.glob("*.bin")
                if f.is_file() and f.parent == self.storage_path
            ]
        except Exception as e:
            raise EmbeddingStoreError(f"Failed to list embeddings: {e}")

    async def retrieve_all(self) -> Dict[str, bytes]:
        """Retrieve all stored embeddings."""
        results = {}
        try:
            for f in self.storage_path.glob("*.bin"):
                if f.is_file() and f.parent == self.storage_path:
                    user_id = f.stem
                    results[user_id] = f.read_bytes()
            return results
        except Exception as e:
            raise EmbeddingStoreError(f"Failed to retrieve all embeddings: {e}")

    async def get_metadata(self, user_id: str) -> Optional[dict]:
        """Get metadata for a user's embedding."""
        metadata_file = self._metadata_file(user_id)
        if not metadata_file.exists():
            return None

        try:
            return json.loads(metadata_file.read_text(encoding="utf-8"))
        except Exception as e:
            raise EmbeddingStoreError(
                f"Failed to read metadata for user '{user_id}': {e}"
            )

    async def count(self) -> int:
        """Count total stored embeddings."""
        try:
            return len([
                f for f in self.storage_path.glob("*.bin")
                if f.is_file() and f.parent == self.storage_path
            ])
        except Exception as e:
            raise EmbeddingStoreError(f"Failed to count embeddings: {e}")

    async def archive_embedding(self, user_id: str) -> bool:
        """
        Archive a user's current embedding before re-enrollment.

        Moves the existing .bin file to the archive directory with a timestamp suffix.
        Per FR-PROF-02 — supports re-enrollment without losing history.

        Returns:
            True if archived, False if no existing embedding to archive.
        """
        embedding_file = self._embedding_file(user_id)
        if not embedding_file.exists():
            return False

        try:
            timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
            safe_id = user_id.replace("/", "_").replace("\\", "_").replace("..", "_")
            archive_file = self.archive_path / f"{safe_id}_{timestamp}.bin"
            os.rename(str(embedding_file), str(archive_file))
            logger.info(
                f"Archived previous embedding for '{user_id}' -> {archive_file.name}"
            )
            return True
        except Exception as e:
            raise EmbeddingStoreError(
                f"Failed to archive embedding for '{user_id}': {e}"
            )
