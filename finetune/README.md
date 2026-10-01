# Piyu Teacher — your own fine-tuned model (free)

You cannot train a big LLM from zero (that needs thousands of GPUs). What you CAN do, for free, is **fine-tune** a small open model (LoRA) so it speaks Piyu's Hinglish teacher style and sticks to your documents.

## 1. Make the dataset (on your computer, no cost)
```bash
# export your state (your own token; keep it private):
curl -s -H "X-Piyu-Token: $TOKEN" https://ai.kvlbusinesssolutions.com/api/state > state.json
node finetune/make_dataset.js state.json 900 > finetune/dataset.jsonl
```
More documents (courses, notes) → better data. 300–1000 records is a good start.

## 2. Train on a free GPU
Open `piyu_finetune_colab.ipynb` in Google Colab (or Kaggle), choose the free T4 GPU, upload `dataset.jsonl`, run all cells. It downloads `piyu-teacher...Q4_K_M.gguf` (~2 GB).

## 3. Put it on the VPS
```bash
scp piyu-teacher.Q4_K_M.gguf root@VPS:/tmp/
ssh root@VPS
cat > /tmp/Modelfile <<EOF
FROM /tmp/piyu-teacher.Q4_K_M.gguf
PARAMETER temperature 0.2
PARAMETER num_ctx 3072
PARAMETER num_predict 220
EOF
ollama create piyu-teacher -f /tmp/Modelfile      # replaces the current persona model; Piyu picks "piyu-*" first
```
Test a few questions; if it is worse than before, run `deploy/ollama_piyu.sh` again to go back to the plain persona model.

## Honest limits
* The training data is made by rules from your documents, so the model learns *style + grounding* (answer from the excerpt, say "not found" otherwise) — it does not become smarter than its base model.
* On the 2-CPU VPS an answer still takes ~20–30 s (CPU only). More RAM/CPU is the only real speed-up.
