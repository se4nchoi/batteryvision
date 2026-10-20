# models/

Put the OpenVINO model downloaded from Intel Geti here. Everything except this README is git-ignored.

```
models/
  model.xml   # OpenVINO IR graph (includes ModelAPI metadata: model type, labels, preprocessing)
  model.bin   # weights
```

If your download has different file names or sits in a subfolder, either rename the files or point to them:

```powershell
$env:BV_MODEL_XML = "C:\path\to\export\model.xml"; .\start.ps1
```

Verify before presenting:

```powershell
cd backend
.\.venv\Scripts\python scripts\check_model.py ..\models\model.xml <test_image.jpg>
```

`check_model.py` prints the input/output shapes, the label names the model carries, and the
detections for one image. Check that the label names match your Geti project's labels.
