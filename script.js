const upload = document.getElementById("image-upload");
const pinCount = document.getElementById("pin-count");
const increasePinCount = document.getElementById("increase-pin-count");
const decreasePinCount = document.getElementById("decrease-pin-count");
const titleInput = document.getElementById("title");
const sideLabelInput = document.getElementById("side-label");
const textScale = document.getElementById("text-scale");
const textScaleValue = document.getElementById("text-scale-value");
const pinNumberScale = document.getElementById("pin-number-scale");
const pinNumberScaleValue = document.getElementById("pin-number-scale-value");
const listPosition = document.getElementById("list-position");
const pinList = document.getElementById("pin-list");
const pinStatus = document.getElementById("pin-status");
const removePin = document.getElementById("remove-pin");
const clearPins = document.getElementById("clear-pins");
const exportButton = document.getElementById("export");
const exportMenu = document.querySelector(".export-menu");
const exportOptions = document.querySelectorAll(".export-option");
const message = document.getElementById("message");
const placeholder = document.getElementById("placeholder");
const canvas = document.getElementById("canvas");
const workspace = document.querySelector(".workspace");
const ctx = canvas.getContext("2d");

let image = null;
let count = 8;
let selectedPin = 1;
let draggingPin = null;
let loadId = 0;
let exportFormat = "png";

// Positions are stored relative to the uploaded image.
const pins = new Map();
const descriptions = new Map();

const padding = 24;
const headerHeight = 60;
const titleBottomPadding = 8;
const descriptionTopPadding = 6;
const outputScale = 2;
const maxCanvasDimension = 16384;
const maxCanvasPixels = 8000000;
let imageHeaderHeight = headerHeight;
let canvasRenderScale = outputScale;
let logicalCanvasWidth = 0;
let logicalCanvasHeight = 0;
let drawTimer = null;

let imageBox = { x: 0, y: 0, width: 0, height: 0 };

function renderedTextSizes(width, height) {
  const areaScale = Math.max(
    0.5,
    Math.min(1, Math.sqrt(width * height) / 1200),
  );
  const scale = 4 * 10 ** Number(textScale.value);

  return {
    title: Math.round(Math.max(16, 30 * areaScale) * scale),
    list: Math.round(Math.max(15, 28 * areaScale) * scale),
    footer: Math.round(Math.max(12, 20 * areaScale) * scale),
    row: Math.round(Math.max(28, 28 * areaScale * 1.45) * scale),
  };
}

function renderedPinNumberSize(width, height) {
  const scale = 4 * 10 ** Number(pinNumberScale.value);
  const baseSize = Math.max(
    16,
    Math.min(56, Math.min(width, height) * 0.06),
  );

  return Math.round(baseSize * scale);
}

function updateCanvasPreviewSize() {
  if (!image || !logicalCanvasWidth || !logicalCanvasHeight) return;

  const availableWidth = Math.max(1, workspace.clientWidth - 40);
  const availableHeight = Math.max(1, workspace.clientHeight - 40);
  const previewScale = Math.min(
    1,
    availableWidth / logicalCanvasWidth,
    availableHeight / logicalCanvasHeight,
  );

  canvas.style.width = `${logicalCanvasWidth * previewScale}px`;
}

function scheduleDraw() {
  clearTimeout(drawTimer);
  drawTimer = setTimeout(() => {
    drawTimer = null;
    draw();
  }, 100);
}

function renderPinInputs() {
  pinList.replaceChildren();

  for (let number = 1; number <= count; number += 1) {
    const row = document.createElement("div");
    row.className = "pin-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pin-button";
    button.dataset.pin = number;
    button.textContent = number;
    button.addEventListener("click", () => {
      selectedPin = number;
      updatePinButtons();
    });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Pin ${number} description`;
    input.setAttribute("aria-label", `Pin ${number} description`);
    input.maxLength = 100;
    input.value = descriptions.get(number) || "";
    input.addEventListener("input", () => {
      descriptions.set(number, input.value);
      draw();
    });

    row.append(button, input);
    pinList.appendChild(row);
  }

  updatePinButtons();
}

function updatePinButtons() {
  for (const button of pinList.querySelectorAll(".pin-button")) {
    const number = Number(button.dataset.pin);
    const selected = number === selectedPin;
    const placed = pins.has(number);

    button.classList.toggle("selected", selected);
    button.classList.toggle("placed", placed);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute(
      "aria-label",
      `Select pin ${number}, ${placed ? "placed" : "not placed"}`,
    );
  }

  const placedCount = [...pins.keys()].filter(
    (number) => number <= count,
  ).length;
  pinStatus.textContent = `${placedCount} / ${count} placed`;
}

function setPinCount(value) {
  const parsedValue = Number.parseInt(value, 10);
  count = Number.isFinite(parsedValue)
    ? Math.max(1, Math.min(200, parsedValue))
    : 1;
  pinCount.value = count;
  selectedPin = Math.min(selectedPin, count);
  increasePinCount.disabled = count >= 200;
  decreasePinCount.disabled = count <= 1;

  renderPinInputs();
  draw();
}

function resizeCanvas() {
  if (!image) return;

  // Render the image at a consistent logical size, then export at 2x resolution.
  const scale = 1200 / Math.max(image.naturalWidth, image.naturalHeight);
  const imageWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const imageHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const textSizes = renderedTextSizes(imageWidth, imageHeight);
  const title = titleInput.value.trim();
  imageHeaderHeight = title
    ? Math.max(
        headerHeight,
        padding + textSizes.title + titleBottomPadding,
      )
    : headerHeight;

  ctx.font = `${textSizes.list}px sans-serif`;
  const listContentWidth = Math.max(
    ...Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      const description = descriptions.get(number)?.trim() || "";
      return ctx.measureText(
        description ? `${number}: ${description}` : `${number}:`,
      ).width;
    }),
  );

  const footerText = sideLabelInput.value.trim();
  ctx.font = `${textSizes.footer}px sans-serif`;
  const footerWidth = footerText ? ctx.measureText(footerText).width : 0;
  const footerHeight = footerText ? textSizes.footer + padding : 0;
  ctx.font = `bold ${textSizes.title}px sans-serif`;
  const titleWidth = title ? ctx.measureText(title).width : 0;

  const listHeight = count * textSizes.row + descriptionTopPadding;
  const isLeft = listPosition.value === "left";
  const leftListWidth = isLeft ? listContentWidth + padding : 0;
  const titleOverflow = isLeft
    ? Math.max(0, (titleWidth - imageWidth) / 2)
    : 0;
  const contentWidth = isLeft
    ? Math.max(
        leftListWidth + imageWidth + titleOverflow * 2,
        footerWidth,
      )
    : Math.max(imageWidth, listContentWidth, titleWidth, footerWidth);
  const diagramX = isLeft
    ? padding + leftListWidth + titleOverflow
    : padding + (contentWidth - imageWidth) / 2;

  imageBox = {
    x: diagramX,
    y: imageHeaderHeight,
    width: imageWidth,
    height: imageHeight,
  };

  const canvasWidth = Math.ceil(padding * 2 + contentWidth);
  let canvasHeight;

  if (isLeft) {
    canvasHeight = Math.ceil(
      imageHeaderHeight + Math.max(imageHeight, listHeight) + padding + footerHeight,
    );
  } else {
    canvasHeight = Math.ceil(
      imageHeaderHeight + imageHeight + padding + listHeight + padding + footerHeight,
    );
  }

  logicalCanvasWidth = canvasWidth;
  logicalCanvasHeight = canvasHeight;
  canvasRenderScale = Math.min(
    outputScale,
    maxCanvasDimension / canvasWidth,
    maxCanvasDimension / canvasHeight,
    Math.sqrt(maxCanvasPixels / (canvasWidth * canvasHeight)),
  );
  canvas.width = Math.max(1, Math.floor(canvasWidth * canvasRenderScale));
  canvas.height = Math.max(1, Math.floor(canvasHeight * canvasRenderScale));
  ctx.setTransform(canvasRenderScale, 0, 0, canvasRenderScale, 0, 0);
  updateCanvasPreviewSize();
}

function numberFontSize() {
  return renderedPinNumberSize(imageBox.width, imageBox.height);
}

function draw() {
  if (!image) return;

  resizeCanvas();
  const textSizes = renderedTextSizes(imageBox.width, imageBox.height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(
    0,
    0,
    logicalCanvasWidth,
    logicalCanvasHeight,
  );

  // Side label.
  const title = titleInput.value.trim();
  if (title) {
    ctx.fillStyle = "#000000";
    ctx.font = `bold ${textSizes.title}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      title,
      imageBox.x + imageBox.width / 2,
      padding + textSizes.title / 2,
    );
  }

  ctx.drawImage(
    image,
    imageBox.x,
    imageBox.y,
    imageBox.width,
    imageBox.height,
  );

  // Plain black numbers, without circles or backgrounds.
  ctx.fillStyle = "#000000";
  ctx.font = `${numberFontSize()}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const [number, position] of pins) {
    if (number > count) continue;

    const x = imageBox.x + position.x * imageBox.width;
    const y = imageBox.y + position.y * imageBox.height;
    ctx.fillText(String(number), x, y);
  }

  // Plain list, e.g. "1: GND".
  const isLeft = listPosition.value === "left";
  const listX = isLeft ? padding : padding;
  const listY = isLeft
    ? imageHeaderHeight + descriptionTopPadding
    : imageHeaderHeight + imageBox.height + padding + descriptionTopPadding;
  ctx.fillStyle = "#000000";
  ctx.font = `${textSizes.list}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (let number = 1; number <= count; number += 1) {
    const description = descriptions.get(number)?.trim() || "";
    const text = description ? `${number}: ${description}` : `${number}:`;

    ctx.fillText(text, listX, listY + textSizes.row * (number - 0.5));
  }

  const footerText = sideLabelInput.value.trim();
  if (footerText) {
    ctx.fillStyle = "#000000";
    ctx.font = `${textSizes.footer}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      footerText,
      padding,
      logicalCanvasHeight - padding - textSizes.footer / 2,
    );
  }
}

function canvasPosition(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x:
      ((event.clientX - rect.left) / rect.width) *
      logicalCanvasWidth,
    y:
      ((event.clientY - rect.top) / rect.height) *
      logicalCanvasHeight,
  };
}

function setPinPosition(number, point) {
  const x = Math.max(
    0,
    Math.min(1, (point.x - imageBox.x) / imageBox.width),
  );
  const y = Math.max(
    0,
    Math.min(1, (point.y - imageBox.y) / imageBox.height),
  );

  pins.set(number, { x, y });
}

function nextUnplacedPin() {
  for (let offset = 1; offset <= count; offset += 1) {
    const number = ((selectedPin - 1 + offset) % count) + 1;
    if (!pins.has(number)) {
      selectedPin = number;
      return;
    }
  }
}

upload.addEventListener("change", () => {
  const file = upload.files[0];
  if (!file) return;

  const currentLoad = ++loadId;
  const url = URL.createObjectURL(file);
  const newImage = new Image();

  newImage.onload = () => {
    URL.revokeObjectURL(url);
    if (currentLoad !== loadId) return;

    if (!newImage.naturalWidth || !newImage.naturalHeight) {
      message.textContent = "This image has no usable dimensions.";
      return;
    }

    image = newImage;
    pins.clear();
    selectedPin = 1;

    canvas.hidden = false;
    placeholder.hidden = true;
    exportButton.disabled = false;
    message.textContent = "";

    updatePinButtons();
    draw();
  };

  newImage.onerror = () => {
    URL.revokeObjectURL(url);
    if (currentLoad === loadId) {
      message.textContent = "Could not load that image. Try another file.";
    }
  };

  newImage.src = url;
});

pinCount.addEventListener("change", () => setPinCount(pinCount.value));
increasePinCount.addEventListener("click", () => setPinCount(count + 1));
decreasePinCount.addEventListener("click", () => setPinCount(count - 1));

titleInput.addEventListener("input", draw);
sideLabelInput.addEventListener("input", draw);

function resetScale(slider, output) {
  slider.value = "0";
  output.textContent = "1.0x";
  slider.setAttribute("aria-valuetext", "1.0x");
  scheduleDraw();
}

textScale.addEventListener("input", () => {
  const scaleValue = 10 ** Number(textScale.value);
  const formattedScale = `${scaleValue.toFixed(1)}x`;
  textScaleValue.textContent = formattedScale;
  textScale.setAttribute("aria-valuetext", formattedScale);
  scheduleDraw();
});
textScale.addEventListener("dblclick", (event) => {
  event.preventDefault();
  resetScale(textScale, textScaleValue);
});
pinNumberScale.addEventListener("input", () => {
  const scaleValue = 10 ** Number(pinNumberScale.value);
  const formattedScale = `${scaleValue.toFixed(1)}x`;
  pinNumberScaleValue.textContent = formattedScale;
  pinNumberScale.setAttribute("aria-valuetext", formattedScale);
  scheduleDraw();
});
pinNumberScale.addEventListener("dblclick", (event) => {
  event.preventDefault();
  resetScale(pinNumberScale, pinNumberScaleValue);
});
listPosition.addEventListener("change", draw);
window.addEventListener("resize", updateCanvasPreviewSize);

for (const option of exportOptions) {
  option.addEventListener("click", () => {
    exportFormat = option.dataset.format;
    exportButton.textContent = `Export ${option.textContent.trim()}`;

    for (const formatOption of exportOptions) {
      const selected = formatOption === option;
      formatOption.classList.toggle("selected", selected);
      formatOption.setAttribute("aria-pressed", String(selected));
    }

    exportMenu.open = false;
  });
}

canvas.addEventListener("pointerdown", (event) => {
  if (!image) return;

  const point = canvasPosition(event);
  const fontSize = numberFontSize();

  ctx.font = `${fontSize}px sans-serif`;

  // Look for an existing number to drag, starting with the topmost.
  const entries = [...pins.entries()].reverse();
  const hit = entries.find(([number, position]) => {
    if (number > count) return false;

    const x = imageBox.x + position.x * imageBox.width;
    const y = imageBox.y + position.y * imageBox.height;
    const halfWidth = Math.max(
      fontSize * 0.5,
      ctx.measureText(String(number)).width / 2,
    );

    return (
      Math.abs(point.x - x) <= halfWidth + 6 &&
      Math.abs(point.y - y) <= fontSize / 2 + 6
    );
  });

  if (hit) {
    selectedPin = hit[0];
    draggingPin = hit[0];
  } else {
    const insideImage =
      point.x >= imageBox.x &&
      point.x <= imageBox.x + imageBox.width &&
      point.y >= imageBox.y &&
      point.y <= imageBox.y + imageBox.height;

    if (!insideImage) return;

    draggingPin = selectedPin;
    setPinPosition(draggingPin, point);
    nextUnplacedPin();
  }

  canvas.setPointerCapture(event.pointerId);
  updatePinButtons();
  draw();
});

canvas.addEventListener("pointermove", (event) => {
  if (draggingPin === null) return;

  setPinPosition(draggingPin, canvasPosition(event));
  draw();
});

function stopDragging() {
  draggingPin = null;
}

canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("lostpointercapture", stopDragging);

removePin.addEventListener("click", () => {
  pins.delete(selectedPin);
  updatePinButtons();
  draw();
});

clearPins.addEventListener("click", () => {
  pins.clear();
  selectedPin = 1;
  updatePinButtons();
  draw();
});

exportButton.addEventListener("click", () => {
  try {
      const mimeType = `image/${exportFormat}`;
      const quality = exportFormat === "jpeg" ? 0.8 : undefined;
      canvas.toBlob((blob) => {
      if (!blob) {
        message.textContent = "Could not export the image.";
        return;
      }

        if (blob.type !== mimeType) {
          message.textContent = `${exportFormat.toUpperCase()} export is not supported by this browser.`;
          return;
        }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileName = titleInput.value
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[. ]+$/g, "") || "pinout";
      link.href = url;
      link.download = `${fileName}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.textContent = "";
    }, mimeType, quality);
  } catch {
    message.textContent =
      "Could not export this image. Try an SVG without external resources.";
  }
});

renderPinInputs();