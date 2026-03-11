import pytest
from pathlib import Path
from unittest.mock import MagicMock

from app.services.file_processor import FileProcessor


# -------------------------
# Fixtures
# -------------------------

@pytest.fixture
def processor(monkeypatch):
    """Create FileProcessor with mocked OCR."""
    fake_reader = MagicMock()
    fake_reader.readtext.return_value = []

    monkeypatch.setattr(
        "app.services.file_processor.easyocr.Reader",
        lambda *args, **kwargs: fake_reader
    )

    return FileProcessor()


@pytest.fixture
def sample_txt(tmp_path):
    """Create temporary text file."""
    file = tmp_path / "sample.txt"
    file.write_text("Hello world\nThis is a test")
    return str(file)


@pytest.fixture
def large_file(tmp_path):
    """Create file exceeding size limit."""
    file = tmp_path / "large.txt"
    file.write_bytes(b"a" * (60 * 1024 * 1024))  # 60MB
    return str(file)


# -------------------------
# validate_file tests
# -------------------------

@pytest.mark.parametrize(
    "filename,expected",
    [
        ("missing.txt", False),
    ]
)
def test_validate_file_missing(processor, filename, expected):
    valid, _ = processor.validate_file(filename)
    assert valid == expected


def test_validate_file_valid(processor, sample_txt):
    valid, msg = processor.validate_file(sample_txt)
    assert valid is True
    assert msg == "Valid"


def test_validate_file_too_large(processor, large_file):
    valid, msg = processor.validate_file(large_file)
    assert valid is False
    assert "exceeds" in msg.lower()


# -------------------------
# extract_text tests
# -------------------------

def test_extract_text(processor, sample_txt):
    text = processor.extract_text(sample_txt)
    assert "Hello world" in text


def test_extract_text_invalid_file(processor):
    with pytest.raises(Exception):
        processor.extract_text("nonexistent.txt")


# -------------------------
# OCR tests (mocked)
# -------------------------

@pytest.mark.skipif(Reason = "M4 3arfeen code meen")
@pytest.mark.integration
def test_extract_image_text(processor, monkeypatch, tmp_path):
    fake_reader = MagicMock()
    fake_reader.readtext.return_value = [
        ("text", "Hello", 0.9),
        ("text", "World", 0.95),
    ]

    processor.ocr_reader = fake_reader

    img = tmp_path / "image.png"
    img.write_bytes(b"fakeimage")

    text = processor.extract_image_text(str(img))

    assert isinstance(text, str)


def test_extract_image_text_no_reader(processor):
    processor.ocr_reader = None

    with pytest.raises(RuntimeError):
        processor.extract_image_text("image.png")


# -------------------------
# process_file routing
# -------------------------

@pytest.mark.parametrize(
    "ext,method",
    [
        ("txt", "extract_text"),
        ("pdf", "extract_pdf"),
        ("docx", "extract_docx"),
        ("png", "extract_image_text"),
    ]
)
def test_process_file_routes_correct_method(processor, monkeypatch, tmp_path, ext, method):
    file = tmp_path / f"file.{ext}"
    file.write_text("test")

    fake_method = MagicMock(return_value="ok")
    monkeypatch.setattr(processor, method, fake_method)

    result = processor.process_file(str(file), ext)

    fake_method.assert_called_once()
    assert result == "ok"


def test_process_file_invalid_type(processor, sample_txt):
    with pytest.raises(ValueError):
        processor.process_file(sample_txt, "xyz")


def test_process_file_validation_failure(processor):
    with pytest.raises(ValueError):
        processor.process_file("missing.txt", "txt")