"""
Tests for file processor module
Run: pytest tests/test_file_processor.py -v
"""

import pytest
import tempfile
from pathlib import Path
from app.services.file_processor import FileProcessor


@pytest.fixture
def processor():
    """Create a FileProcessor instance for testing."""
    return FileProcessor(max_size_mb=50)


@pytest.fixture
def sample_text_file():
    """Create a temporary text file for testing."""
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.txt',
        delete=False,
        encoding='utf-8'
    ) as f:
        f.write("This is a test document.\n")
        f.write("It has multiple lines.\n")
        f.write("For testing text extraction.\n")
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    Path(temp_path).unlink()


class TestFileProcessor:
    """Test suite for FileProcessor."""
    
    def test_processor_initialization(self, processor):
        """Test that processor initializes without errors."""
        assert processor is not None
        assert processor.max_size_bytes == 50 * 1024 * 1024
    
    def test_validate_file_exists(self, processor, sample_text_file):
        """Test validation of existing file."""
        is_valid, message = processor.validate_file(sample_text_file)
        assert is_valid
        assert message == "Valid"
    
    def test_validate_file_not_exists(self, processor):
        """Test validation of non-existent file."""
        is_valid, message = processor.validate_file("/nonexistent/path.txt")
        assert not is_valid
        assert "not found" in message.lower()
    
    def test_extract_text_file(self, processor, sample_text_file):
        """Test extraction from text file."""
        text = processor.extract_text(sample_text_file)
        assert "test document" in text
        assert len(text) > 0
        assert "multiple lines" in text
    
    def test_process_file_txt(self, processor, sample_text_file):
        """Test main process_file method with text file."""
        text = processor.process_file(sample_text_file, "txt")
        assert isinstance(text, str)
        assert len(text) > 50
    
    def test_process_file_auto_detect(self, processor, sample_text_file):
        """Test auto-detection of file type."""
        text = processor.process_file(sample_text_file)  # No file_type specified
        assert isinstance(text, str)
        assert len(text) > 0
    
    def test_unsupported_file_type(self, processor, sample_text_file):
        """Test error handling for unsupported file type."""
        with pytest.raises(ValueError) as exc_info:
            processor.process_file(sample_text_file, "xyz")
        assert "unsupported" in str(exc_info.value).lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
