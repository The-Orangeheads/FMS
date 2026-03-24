# tests/test_embedding_service.py
import pytest
from unittest.mock import MagicMock, patch

from app.services.embedding import (
    EmbeddingService,
    SBERTModel,
    SiglipModel,
    EmbeddingModelInterface
)
from app.schemas import ChunkInput, EmbeddingOutput, EmbeddingResponse


# -------------------------
# Fixtures
# -------------------------

@pytest.fixture
def fake_chunks():
    """Return a list of fake ChunkInput objects."""
    return [
        ChunkInput(text="Hello world", metadata={"id": 1}),
        ChunkInput(text="Another text", metadata={"id": 2}),
        ChunkInput(text=None, metadata={"id": 3})  # empty text should be ignored
    ]


@pytest.fixture
def fake_vectors():
    """Return dummy vectors."""
    return [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6]
    ]


@pytest.fixture
def service():
    """Return an EmbeddingService with models mocked."""
    svc = EmbeddingService()
    
    # Create fake SBERTModel mock
    sbert_mock = MagicMock()
    sbert_mock.embed.return_value = [[0.1,0.2,0.3], [0.4,0.5,0.6]]
    
    # Create fake SiglipModel mock
    siglip_mock = MagicMock()
    siglip_mock.embed.return_value = [[0.7,0.8,0.9]]

    # Map exact registry keys to mocks
    def get_model_side_effect(key):
        if key in ["bge-m3", "paraphrase-multilingual", "distiluse-multilingual", "arabic-sbert", "arabic-minilm"]:
            return sbert_mock
        elif key == "siglip2":
            return siglip_mock
        else:
            raise ValueError(f"Unknown model {key}")
    
    svc._get_model = MagicMock(side_effect=get_model_side_effect)
    
    return svc

# -------------------------
# Interface Tests
# -------------------------

def test_embedding_interface_not_implemented():
    """Check that calling embed on interface raises NotImplementedError."""
    model = EmbeddingModelInterface()
    with pytest.raises(NotImplementedError):
        model.embed([])


# -------------------------
# SBERT/Siglip mocked embedding tests
# -------------------------

@pytest.mark.parametrize(
    "model_key,expected_vectors_len",
    [
        ("bge-m3", 2),
        ("paraphrase-multilingual", 2),
        ("siglip2", 1)
    ]
)
def test_process_embeddings_returns_vectors(service, fake_chunks, model_key, expected_vectors_len):
    """Test that process_embeddings returns correct vectors and metadata."""
    response: EmbeddingResponse = service.process_embeddings(model_key, fake_chunks)
    
    # Check type
    assert isinstance(response, EmbeddingResponse)
    assert response.model_used == model_key
    assert isinstance(response.results, list)
    
    # Check results
    assert len(response.results) == expected_vectors_len
    for out in response.results:
        assert isinstance(out, EmbeddingOutput)
        assert isinstance(out.vector, list)
        assert "id" in out.metadata


def test_process_embeddings_invalid_model(service, fake_chunks):
    """Test that invalid model key raises ValueError."""
    service._get_model = MagicMock(side_effect=ValueError("Model not found"))
    
    with pytest.raises(ValueError, match="Model not found"):
        service.process_embeddings("invalid-model", fake_chunks)


# -------------------------
# SBERTModel.embed mocked
# -------------------------

@patch("app.services.embedding.SentenceTransformer")
def test_sbert_model_embed(mock_transformer, fake_chunks):
    """Test SBERTModel.embed logic without downloading model."""
    fake_model = MagicMock()
    fake_model.encode.return_value.cpu.return_value.tolist.return_value = [[0.1,0.2],[0.3,0.4]]
    mock_transformer.return_value = fake_model
    
    model = SBERTModel("dummy-model")
    vectors = model.embed(fake_chunks)
    
    # Only non-empty text should be embedded
    assert vectors == [[0.1,0.2],[0.3,0.4]]
    fake_model.encode.assert_called_once()


# -------------------------
# SiglipModel.embed mocked
# -------------------------
from unittest.mock import patch, MagicMock
import pytest
from app.services.embedding import SiglipModel, ChunkInput

@patch("app.services.embedding.AutoModel")
@patch("app.services.embedding.AutoProcessor")
@patch("app.services.embedding.Image")
@patch("app.services.embedding.io.BytesIO")
@patch("app.services.embedding.base64.b64decode")
@patch("app.services.embedding.torch")
def test_siglip_model_embed(mock_torch, mock_b64, mock_bytesio, mock_image, mock_processor, mock_model):
    """Test SiglipModel.embed without real images or HF models."""

    # --------------------
    # Mock torch and device
    # --------------------
    mock_torch.cuda.is_available.return_value = False

    # Properly mock no_grad as a context manager
    mock_no_grad_cm = MagicMock()
    mock_no_grad_cm.__enter__.return_value = None
    mock_no_grad_cm.__exit__.return_value = None
    mock_torch.no_grad.return_value = mock_no_grad_cm

    # --------------------
    # Mock processor
    # --------------------
    class MockBatchEncoding(dict):
        # Catch the .to() call and return self so **inputs unpacking still works
        def to(self, *args, **kwargs):
            return self

    fake_processor = MagicMock()
    fake_processor.return_value = MockBatchEncoding({
        "input_ids": MagicMock(), 
        "attention_mask": MagicMock()
    })
    mock_processor.from_pretrained.return_value = fake_processor
    # --------------------
    # Mock model
    # --------------------
    # Traverse the exact chain shown in the traceback:
    # AutoModel.from_pretrained().to().eval().get_image_features().__truediv__().squeeze().cpu().tolist()
    
    fake_model = MagicMock()
    
    # 1. Setup the initial model loading, moving to device, and setting to eval mode
    mock_model.from_pretrained.return_value.to.return_value.eval.return_value = fake_model
    
    # 2. Setup the tensor operations chain
    fake_features = fake_model.get_image_features.return_value
    fake_normalized = fake_features.__truediv__.return_value
    fake_squeezed = fake_normalized.squeeze.return_value
    fake_cpu = fake_squeezed.cpu.return_value
    
    # 3. Finally, make tolist() return an actual Python list (representing your vectors)
    # Assuming batch size of 1, returning a list containing one vector list
    fake_cpu.tolist.return_value = [[0.5, 0.6]]

    # --------------------
    # Create model instance
    # --------------------
    model = SiglipModel("dummy-siglip")

    # --------------------
    # Create a fake chunk with base64 image
    # --------------------
    chunk = ChunkInput(text=None, image_base64="ZmFrZV9pbWFnZQ==", metadata={})

    # Ensure model.device is 'cpu'
    with patch.object(model, "device", "cpu"):
        vectors = model.embed([chunk])

    # --------------------
    # Assertions
    # --------------------
    assert isinstance(vectors, list)
    assert len(vectors) == 1
    assert isinstance(vectors[0], list)