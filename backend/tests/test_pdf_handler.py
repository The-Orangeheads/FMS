import pytest
from unittest.mock import MagicMock, patch
import pandas as pd

from app.core.pdf_handler import PDFHandler

# -------------------------
# Fixtures
# -------------------------

@pytest.fixture
def handler():
    return PDFHandler()


@pytest.fixture
def mock_page():
    """Mock a fitz.Page object."""
    page = MagicMock()
    page.get_images.return_value = []
    page.get_text.return_value = "Sample text"
    page.parent.extract_image.return_value = {"width": 100, "height": 100}
    return page


def make_mock_fitz_doc(pages):
    """Return a MagicMock that mimics fitz.Document with .close(), iteration, and indexing."""
    doc = MagicMock()
    doc.__iter__.return_value = iter(pages)
    doc.__getitem__.side_effect = lambda i: pages[i]
    doc.close.return_value = None
    return doc


# -------------------------
# Test calculate_page_complexity
# -------------------------

def test_calculate_page_complexity_returns_int(handler, mock_page):
    result = handler.calculate_page_complexity(mock_page)
    assert isinstance(result, int)


# -------------------------
# Test _df_to_markdown
# -------------------------

def test_df_to_markdown_empty(handler):
    df = pd.DataFrame()
    assert handler._df_to_markdown(df) == ""


def test_df_to_markdown_nonempty(handler):
    df = pd.DataFrame({"A": [1, 2], "B": ["x\n", "y"]})
    markdown = handler._df_to_markdown(df)
    assert "A" in markdown
    assert "B" in markdown
    assert "x " in markdown  # newline replaced


# -------------------------
# Test _extract_images
# -------------------------

def test_extract_images_skips_small_images(handler, mock_page):
    mock_page.get_images.return_value = [(1,)]
    mock_page.parent.extract_image.return_value = {"width": 20, "height": 20}
    images = handler._extract_images(mock_page)
    assert images == []


def test_extract_images_valid(handler, mock_page):
    mock_page.get_images.return_value = [(1,)]
    mock_page.parent.extract_image.return_value = {"width": 100, "height": 120}
    images = handler._extract_images(mock_page)
    assert images == ["[Image: 100x120]"]


# -------------------------
# Test _extract_complex
# -------------------------

@patch("app.services.text_handler.pdfplumber.open")
def test_extract_complex(mock_pdfplumber, handler):
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Page text"
    mock_page.extract_tables.return_value = [
        [["Col1", "Col2"], ["a", "b"], ["c", "d"]]
    ]
    mock_pdf = MagicMock()
    mock_pdf.pages = [mock_page]
    mock_pdfplumber.return_value.__enter__.return_value = mock_pdf

    text, tables = handler._extract_complex("dummy.pdf", 0)
    assert text == "Page text"
    assert isinstance(tables[0], pd.DataFrame)
    assert list(tables[0].columns) == ["Col1", "Col2"]


# -------------------------
# Test process_document
# -------------------------

@patch("app.services.text_handler.fitz.open")
def test_process_document_basic(mock_fitz_open, handler, mock_page):
    # Proper Document mock
    mock_fitz_open.return_value = make_mock_fitz_doc([mock_page, mock_page])

    # Patch calculate_page_complexity
    handler.calculate_page_complexity = MagicMock(return_value=1)

    pages = handler.process_document("dummy.pdf")
    assert len(pages) == 2
    for p in pages:
        assert "text" in p
        assert "page_number" in p
        assert "Sample text" in p["text"]


@pytest.mark.parametrize("complexity_score", [-10, 0, 10])
@patch("app.services.text_handler.fitz.open")
@patch("app.services.text_handler.pdfplumber.open")
def test_process_document_complex_table(mock_pdfplumber_open, mock_fitz_open, handler, complexity_score):
    # Mock fitz page
    mock_page = MagicMock()
    mock_page.get_text.return_value = "Simple text"
    mock_page.get_images.return_value = []
    mock_page.parent.extract_image.return_value = {"width": 100, "height": 100}
    mock_fitz_open.return_value = make_mock_fitz_doc([mock_page])

    # Patch complexity
    handler.calculate_page_complexity = MagicMock(return_value=complexity_score)

    # Patch pdfplumber
    mock_pdf_page = MagicMock()
    mock_pdf_page.extract_text.return_value = "Complex page text"
    mock_pdf_page.extract_tables.return_value = [
        [["A", "B"], ["1", "2"]]
    ]
    mock_pdf = MagicMock()
    mock_pdf.pages = [mock_pdf_page]
    mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

    pages = handler.process_document("dummy.pdf")
    assert isinstance(pages, list)
    assert "text" in pages[0]


# -------------------------
# Test pending table handling
# -------------------------

def test_pending_table_reset(handler, mock_page):
    handler._pending_table_df = pd.DataFrame({"A": [1]})
    handler.calculate_page_complexity = MagicMock(return_value=0)
    mock_page.get_text.return_value = "Page text"

    with patch("app.services.text_handler.fitz.open") as mock_doc_open:
        mock_doc_open.return_value = make_mock_fitz_doc([mock_page])
        pages = handler.process_document("dummy.pdf")

    # _pending_table_df should be None after processing
    assert handler._pending_table_df is None