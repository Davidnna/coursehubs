#!/usr/bin/env python3
"""Small, dependency-light tests for incremental resource snapshot planning."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("backup_resources.py")
SPEC = importlib.util.spec_from_file_location("backup_resources", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ResourceChangePlanningTests(unittest.TestCase):
    def setUp(self):
        self.previous = {
            "notes/unchanged.pdf": {
                "etag": "aaa",
                "size": 100,
                "last_modified": "2026-11-09T10:00:00+00:00",
                "blob": "hash-a",
                "content_type": "application/pdf",
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
