import types
import pytest
from app.services import embedding as embedding_module
from app.schemas import ChunkInput


class DummyTensor:
    def __init__(self, data):
        self._data = data

    def cpu(self):
        return self

    def to(self, device):
        return self

    def tolist(self):
        return self._data


class DummySBERT:
    def __init__(self, model_name):
        self.model_name = model_name

    def encode(self, texts, convert_to_tensor=False):
        # return a tensor-like object where cpu().tolist() works
        # produce a vector per input
        out = [[len(t) * 0.1, 0.5] for t in texts]
        return DummyTensor(out)


def test_sbert_embedding_monkeypatched(monkeypatch):
    # Patch the SentenceTransformer to our dummy
    monkeypatch.setattr(embedding_module, 'SentenceTransformer', DummySBERT)

    service = embedding_module.EmbeddingService()

    chunks = [ChunkInput(text="hello", metadata={"page": 1}), ChunkInput(text="world", metadata={"page": 2})]
    resp = service.process_embeddings('paraphrase-multilingual', chunks)

    assert resp.model_used == 'paraphrase-multilingual'
    assert len(resp.results) == 2
    assert resp.results[0].metadata == {'page': 1}
    assert isinstance(resp.processing_time_ms, float)


class DummyProcessor:
    @staticmethod
    def from_pretrained(_):
        return DummyProcessor()

    def __call__(self, *args, **kwargs):
        # Return a dict of tensors (keys arbitrary)
        return {"input_ids": DummyTensor([[1, 2, 3]])}


class DummyBatchTensor(DummyTensor):
    def __getitem__(self, idx):
        # return vector-like with tolist
        return DummyTensor(self._data[0])


class DummyModel:
    @staticmethod
    def from_pretrained(_):
        return DummyModel()

    def to(self, device):
        return self

    def __call__(self, **kwargs):
        class Out:
            pooler_output = DummyBatchTensor([[0.1, 0.2]])

        return Out()


def test_siglip_embedding_monkeypatched(monkeypatch):
    # Patch AutoProcessor and AutoModel used by SiglipModel
    monkeypatch.setattr(embedding_module, 'AutoProcessor', DummyProcessor)
    monkeypatch.setattr(embedding_module, 'AutoModel', DummyModel)
    # Also force torch.cuda.is_available to False to avoid device differences
    import types, contextlib
    DummyTorch = types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: False),
        no_grad=contextlib.nullcontext
    )
    monkeypatch.setattr(embedding_module, 'torch', DummyTorch)

    service = embedding_module.EmbeddingService()

    chunks = [ChunkInput(text="a text chunk", metadata={"m": 1}), ChunkInput(image_base64=None, metadata={})]
    # Use siglip2 model key registered in the service
    resp = service.process_embeddings('siglip2', [ChunkInput(text="img test", metadata={"p":1})])

    assert resp.model_used == 'siglip2'
    assert len(resp.results) == 1
    assert 'p' in resp.results[0].metadata
