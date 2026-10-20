# models/

Put models downloaded from Intel Geti here, **one folder per model**. Everything except this README
and `meta.example.json` is git-ignored.

```
models/
  yolox_tiny_fp16/
    model.xml        # OpenVINO IR graph (carries ModelAPI metadata: model type, labels, preprocessing)
    model.bin        # weights
    meta.json        # optional: facts copied from Geti (see meta.example.json)
  yolox_s_fp16/
    model.xml
    model.bin
    meta.json
```

The folder name is the model's name everywhere: the Live model picker, the Models page, and each
inspection record (stored with a SHA-256 of the files). A single `models/model.xml` also works and is
registered as `default`.

`meta.json` values (architecture, precision, Geti's own validation score, training time) are shown
with a ⁽ᴳ⁾ mark as *reported by Geti*. They are never mixed into the measured columns.

Check each model before presenting:

```powershell
cd backend
.\.venv\Scripts\python scripts\check_model.py ..\models\yolox_tiny_fp16\model.xml <test_image.jpg>
```
