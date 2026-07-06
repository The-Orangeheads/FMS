---
dataset_info:
  config_name: funsd
  features:
  - name: id
    dtype: string
  - name: tokens
    sequence: string
  - name: bboxes
    sequence:
      sequence: int64
  - name: ner_tags
    sequence:
      class_label:
        names:
          '0': O
          '1': B-HEADER
          '2': I-HEADER
          '3': B-QUESTION
          '4': I-QUESTION
          '5': B-ANSWER
          '6': I-ANSWER
  - name: image
    dtype: image
  splits:
  - name: train
    num_bytes: 27288633.0
    num_examples: 149
  - name: test
    num_bytes: 9931720.0
    num_examples: 50
  download_size: 35837449
  dataset_size: 37220353.0
configs:
- config_name: funsd
  data_files:
  - split: train
    path: funsd/train-*
  - split: test
    path: funsd/test-*
  default: true
---
