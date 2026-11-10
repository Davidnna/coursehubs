#!/usr/bin/env python3
"""Small, dependency-light tests for incremental resource snapshot planning."""

import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("backup_resources.py")
SPEC = importlib.util.spec_from_file_location("backup_resources", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FakeObjectBody(io.BytesIO):
    pass


class FakeS3Client:
    def __init__(self, payload):
        self.payload = payload

    def get_object(self, Bucket, Key):
        return {
            "Body": FakeObjectBody(self.payload),
            "ContentLength": len(self.payload),
            "ContentType": "application/pdf",
            "Metadata": {"source": "test"},
        }


class ResourceChangePlanningTests(unittest.TestCase):
    def setUp(self):
        self.previous = {
            "notes/unchanged.pdf": {
                "etag": "aaa",
                "size": 100,
                "last_modified": "2026-11-09T10:00:00+00:00",
                "blob": "hash-a",
                "content_type": "application/pdf",
                "content_sha256": "sha256-unchanged",
            },
            "notes/changed.pdf": {
                "etag": "bbb",
                "size": 200,
                "last_modified": "2026-11-09T10:00:00+00:00",
                "blob": "hash-b",
                "content_type": "application/pdf",
            },
            "notes/deleted.pdf": {
                "etag": "ccc",
                "size": 300,
                "last_modified": "2026-11-09T10:00:00+00:00",
                "blob": "hash-c",
                "content_type": "application/pdf",
            },
        }
        self.current = {
            "notes/unchanged.pdf": {
                "etag": "aaa",
                "size": 100,
                "last_modified": "2026-11-09T10:00:00+00:00",
                "blob": "hash-unchanged",
            },
            "notes/changed.pdf": {
                "etag": "new-etag",
                "size": 250,
                "last_modified": "2026-11-10T10:00:00+00:00",
                "blob": "hash-changed",
            },
            "notes/new.pdf": {
                "etag": "ddd",
                "size": 400,
                "last_modified": "2026-11-10T11:00:00+00:00",
                "blob": "hash-new",
            },
        }

    def test_incremental_plan_only_downloads_new_and_changed_objects(self):
        changed, deleted, manifest = MODULE.calculate_resource_changes(
            self.previous,
            self.current,
            False,
        )
        self.assertEqual(changed, ["notes/changed.pdf", "notes/new.pdf"])
        self.assertEqual(deleted, ["notes/deleted.pdf"])
        self.assertEqual(manifest["notes/unchanged.pdf"]["content_type"], "application/pdf")
        self.assertEqual(manifest["notes/unchanged.pdf"]["content_sha256"], "sha256-unchanged")
        self.assertEqual(manifest["notes/changed.pdf"]["blob"], "hash-changed")
        self.assertNotIn("notes/deleted.pdf", manifest)

    def test_full_plan_downloads_every_current_object(self):
        changed, deleted, manifest = MODULE.calculate_resource_changes(
            self.previous,
            self.current,
            True,
        )
        self.assertEqual(changed, sorted(self.current))
        self.assertEqual(deleted, ["notes/deleted.pdf"])
        self.assertEqual(set(manifest), set(self.current))

    def test_unchanged_object_is_not_downloaded(self):
        previous = {"file.pdf": self.previous["notes/unchanged.pdf"]}
        current = {"file.pdf": self.current["notes/unchanged.pdf"]}
        changed, deleted, _ = MODULE.calculate_resource_changes(previous, current, False)
        self.assertEqual(changed, [])
        self.assertEqual(deleted, [])

    def test_object_change_detects_metadata_timestamp_change(self):
        previous = {"etag": "same", "size": 100, "last_modified": "2026-11-09T10:00:00+00:00"}
        current = {"etag": "same", "size": 100, "last_modified": "2026-11-10T10:00:00+00:00"}
        self.assertTrue(MODULE.object_changed(previous, current))

    def test_download_records_sha256_and_content_metadata(self):
        payload = b"%PDF-1.7 test resource"
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "object.pdf"
            metadata = MODULE.download_object(
                FakeS3Client(payload),
                "coursehubs-resources",
                "notes/object.pdf",
                destination,
            )

            self.assertEqual(destination.read_bytes(), payload)
            self.assertEqual(metadata["content_sha256"], hashlib.sha256(payload).hexdigest())
            self.assertEqual(metadata["content_type"], "application/pdf")
            self.assertEqual(metadata["metadata"], {"source": "test"})

    def test_download_rejects_incomplete_object(self):
        payload = b"partial resource"

        class IncompleteS3Client(FakeS3Client):
            def get_object(self, Bucket, Key):
                response = super().get_object(Bucket, Key)
                response["ContentLength"] = len(self.payload) + 1
                return response

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "object.pdf"
            with self.assertRaises(MODULE.BackupError):
                MODULE.download_object(
                    IncompleteS3Client(payload),
                    "coursehubs-resources",
                    "notes/object.pdf",
                    destination,
                )
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
