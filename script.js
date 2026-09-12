/* =========================================================
   CALCULATOR LOGIC
   ========================================================= */

"use strict";


/* =========================================================
   DOM
   ========================================================= */

const displayElement       = document.getElementById("display");
const expressionElement    = document.getElementById("expression");

const numberButtons        = document.querySelectorAll("[data-number]");
const operatorButtons      = document.querySelectorAll("[data-operator]");
const actionButtons        = document.querySelectorAll("[data-action]");
const shortcutButtons      = document.querySelectorAll("[data-shortcut]");
const scientificButtons    = document.querySelectorAll("[data-sci]");

const interactionArea      = document.querySelector(".interaction-area");
const interactionTrack     = document.getElementById("interactionTrack");
const panelIndicators      = document.querySelectorAll(".panel-indicator__dot");

const historyScreen        = document.getElementById("historyScreen");
const historyList          = document.getElementById("historyList");
const historyEmpty         = document.getElementById("historyEmpty");


/* =========================================================
   STATE — CALCULATOR ENGINE
   ========================================================= */

let currentValue      = "0";
let previousValue     = null;
let currentOperator   = null;
let waitingForOperand = false;
let justCalculated    = false;


/* =========================================================
   PANEL STATE
   ========================================================= */

/*
 * Panels ordered left → right.
 * 0: shortcuts
 * 1: calculator (initial)
 * 2: scientific
 */

const PANELS      = ["shortcuts", "calculator", "scientific"];
let activePanel   = "calculator";
let panelBeforeHistory = "calculator";

let pointerStartX   = 0;
let pointerStartY   = 0;
let pointerCurrentX = 0;
let pointerIsDown   = false;
let pointerDragging = false;



/* =========================================================
   HISTORY STATE
   ========================================================= */

const HISTORY_KEY   = "calc:history:v1";
const HISTORY_LIMIT = 50;

let historyItems = loadHistory();


/* =========================================================
   DISPLAY MEASURER
   ========================================================= */

const displayMeasurer = document.createElement("span");

displayMeasurer.setAttribute("aria-hidden", "true");

Object.assign(displayMeasurer.style, {
  position: "fixed",
  left: "-99999px",
  top: "-99999px",
  visibility: "hidden",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  width: "max-content"
});

document.body.appendChild(displayMeasurer);


/* =========================================================
   DISPLAY
   ========================================================= */

function updateDisplay(animation = false) {

  displayElement.textContent = formatDisplayValue(currentValue);

  requestAnimationFrame(() => {
    fitDisplayNumber();
  });

  if (animation) {
    animateDisplay("is-entering");
  }
}


function updateExpression(text = "") {

  expressionElement.textContent = text;

  expressionElement.classList.toggle("is-visible", Boolean(text));
}


/* =========================================================
   FORMAT
   ========================================================= */

function formatDisplayValue(value) {

  if (value === "Error") {
    return value;
  }

  const negative  = value.startsWith("-");
  let cleanValue  = negative ? value.slice(1) : value;

  const parts        = cleanValue.split(".");
  let integerPart    = parts[0] || "0";
  const decimalPart  = parts[1];

  if (integerPart.length > 3) {
    integerPart = Number(integerPart).toLocaleString("es-ES");
  }

  let result = integerPart;

  if (decimalPart !== undefined) {
    result += "," + decimalPart;
  }

  if (negative) {
    result = "-" + result;
  }

  return result;
}


/* =========================================================
   DISPLAY ANIMATION
   ========================================================= */

function animateDisplay(className) {

  displayElement.classList.remove(className);

  void displayElement.offsetWidth;

  displayElement.classList.add(className);

  setTimeout(() => {
    displayElement.classList.remove(className);
  }, 300);
}


/* =========================================================
   DISPLAY FIT
   ========================================================= */

function fitDisplayNumber() {

  if (!displayElement) return;

  /*
   * STEP 1: Always reset any inline font-size and force a reflow.
   * This is critical so the CSS-defined base size takes effect again
   * whenever the content shrinks (e.g. backspace). Without this, a
   * previously reduced size could remain sticky.
   */

  displayElement.style.fontSize = "";

  // Force reflow so getComputedStyle returns the fresh, CSS-defined size.
  // eslint-disable-next-line no-unused-expressions
  displayElement.offsetWidth;

  const styles       = window.getComputedStyle(displayElement);
  const baseFontSize = parseFloat(styles.fontSize);
  const minimumSize  = 26;

  /*
   * STEP 2: Configure the invisible measurer using the EXACT same
   * typographic properties as the real display so measurements match.
   */

  displayMeasurer.textContent              = displayElement.textContent;
  displayMeasurer.style.fontFamily         = styles.fontFamily;
  displayMeasurer.style.fontWeight         = styles.fontWeight;
  displayMeasurer.style.fontStyle          = styles.fontStyle;
  displayMeasurer.style.letterSpacing      = styles.letterSpacing;
  displayMeasurer.style.fontVariantNumeric = styles.fontVariantNumeric;
  displayMeasurer.style.fontFeatureSettings = styles.fontFeatureSettings;
  displayMeasurer.style.fontKerning        = styles.fontKerning;
  displayMeasurer.style.textTransform      = styles.textTransform;
  displayMeasurer.style.fontSize           = `${baseFontSize}px`;

  /*
   * STEP 3: Compute available horizontal width taking into account
   * the display's own padding plus a small safety margin.
   */

  const paddingLeft   = parseFloat(styles.paddingLeft)  || 0;
  const paddingRight  = parseFloat(styles.paddingRight) || 0;

  const availableWidth =
    displayElement.clientWidth - paddingLeft - paddingRight - 2;

  if (availableWidth <= 0) {
    return;
  }

  /*
   * STEP 4: Measure the text at the base size first. If it already
   * fits, we leave the inline font-size EMPTY so the element falls
   * back to the CSS clamp() rule. This guarantees that as the content
   * shrinks (backspace, delete, new small value) the display grows
   * back progressively up to the CSS base size — never sticky.
   */

  let textWidth = displayMeasurer.getBoundingClientRect().width;

  if (textWidth <= availableWidth) {
    // Fits at the base size — no inline override needed.
    displayElement.style.fontSize = "";
    return;
  }

  /*
   * STEP 5: Content overflows — shrink until it fits. Uses a 1px
   * step so the transition (defined in CSS) feels smooth.
   */

  let currentSize = baseFontSize;

  while (currentSize > minimumSize) {

    currentSize -= 1;

    displayMeasurer.style.fontSize = `${currentSize}px`;

    textWidth = displayMeasurer.getBoundingClientRect().width;

    if (textWidth <= availableWidth) break;
  }

  displayElement.style.fontSize = `${currentSize}px`;
}


/* =========================================================
   NUMBER INPUT
   ========================================================= */

function inputNumber(number) {

  if (currentValue === "Error") {
    resetCalculator();
  }

  if (justCalculated) {
    currentValue      = number;
    previousValue     = null;
    currentOperator   = null;
    justCalculated    = false;
    clearOperatorSelection();
    updateExpression("");
    updateDisplay(true);
    return;
  }

  if (waitingForOperand) {
    currentValue      = number;
    waitingForOperand = false;
    updateDisplay(true);
    return;
  }

  if (currentValue === "0") {
    currentValue = number;
  } else if (currentValue === "-0") {
    currentValue = "-" + number;
  } else {

    const digitsOnly = currentValue.replace("-", "").replace(".", "");

    if (digitsOnly.length >= 15) return;

    currentValue += number;
  }

  updateDisplay(true);
}


/* =========================================================
   DECIMAL
   ========================================================= */

function inputDecimal() {

  if (currentValue === "Error") resetCalculator();

  if (justCalculated) {
    currentValue      = "0.";
    previousValue     = null;
    currentOperator   = null;
    justCalculated    = false;
    clearOperatorSelection();
    updateExpression("");
    updateDisplay(true);
    return;
  }

  if (waitingForOperand) {
    currentValue      = "0.";
    waitingForOperand = false;
    updateDisplay(true);
    return;
  }

  if (!currentValue.includes(".")) {
    currentValue += ".";
    updateDisplay(true);
  }
}


/* =========================================================
   SIGN
   ========================================================= */

function toggleSign() {

  if (currentValue === "Error") return;
  if (currentValue === "0") return;

  if (currentValue.startsWith("-")) {
    currentValue = currentValue.slice(1);
  } else {
    currentValue = "-" + currentValue;
  }

  justCalculated = false;
  updateDisplay(true);
}


/* =========================================================
   PERCENT
   ========================================================= */

function percentage() {

  if (currentValue === "Error") return;

  const value = parseFloat(currentValue);

  if (!Number.isFinite(value)) return;

  if (previousValue !== null && currentOperator !== null) {

    const previous = parseFloat(previousValue);

    if (currentOperator === "+" || currentOperator === "-") {
      currentValue = cleanNumber((previous * value) / 100);
    } else {
      currentValue = cleanNumber(value / 100);
    }

  } else {
    currentValue = cleanNumber(value / 100);
  }

  updateDisplay(true);
}


/* =========================================================
   BACKSPACE
   ========================================================= */

function backspace() {

  if (currentValue === "Error") {
    resetCalculator();
    return;
  }

  if (justCalculated) justCalculated = false;

  if (waitingForOperand) return;

  if (
    currentValue.length <= 1 ||
    (currentValue.length === 2 && currentValue.startsWith("-"))
  ) {
    currentValue = "0";
  } else {

    currentValue = currentValue.slice(0, -1);

    if (currentValue === "-") currentValue = "0";
  }

  updateDisplay(true);
}


/* =========================================================
   OPERATOR
   ========================================================= */

function chooseOperator(operator) {

  if (currentValue === "Error") return;

  if (currentOperator && previousValue !== null && !waitingForOperand) {
    calculate();
  }

  previousValue     = currentValue;
  currentOperator   = operator;
  waitingForOperand = true;
  justCalculated    = false;

  updateExpression(
    `${formatDisplayValue(previousValue)} ${operatorSymbol(operator)}`
  );

  setActiveOperator(operator);
}


/* =========================================================
   CALCULATE
   ========================================================= */

function calculate() {

  if (currentOperator === null || previousValue === null) return;

  const first  = parseFloat(previousValue);
  const second = parseFloat(currentValue);

  let result;

  switch (currentOperator) {

    case "+": result = first + second; break;
    case "-": result = first - second; break;
    case "*": result = first * second; break;
    case "/":

      if (second === 0) {
        currentValue      = "Error";
        previousValue     = null;
        currentOperator   = null;
        waitingForOperand = false;
        justCalculated    = true;
        updateExpression("No se puede dividir entre cero");
        updateDisplay();
        clearOperatorSelection();
        return;
      }

      result = first / second;
      break;

    case "^": result = Math.pow(first, second); break;

    default: return;
  }

  result = cleanNumber(result);

  const expression =
    `${formatDisplayValue(previousValue)} ${operatorSymbol(currentOperator)} ${formatDisplayValue(currentValue)}`;

  currentValue      = result;
  previousValue     = null;
  currentOperator   = null;
  waitingForOperand = false;
  justCalculated    = true;

  clearOperatorSelection();

  updateExpression(expression);

  displayElement.textContent = formatDisplayValue(currentValue);

  requestAnimationFrame(() => {
    fitDisplayNumber();
  });

  animateDisplay("is-result");

  if (result !== "Error") {
    pushHistory(expression, currentValue);
  }
}


/* =========================================================
   CLEAN NUMBER
   ========================================================= */

function cleanNumber(number) {

  if (!Number.isFinite(number)) return "Error";

  const rounded = Math.round((number + Number.EPSILON) * 1e12) / 1e12;

  if (Object.is(rounded, -0)) return "0";

  return String(rounded);
}


/* =========================================================
   OPERATOR SYMBOL
   ========================================================= */

function operatorSymbol(operator) {

  switch (operator) {
    case "+": return "+";
    case "-": return "−";
    case "*": return "×";
    case "/": return "÷";
    case "^": return "^";
    default:  return "";
  }
}


/* =========================================================
   CLEAR
   ========================================================= */

function resetCalculator() {

  currentValue      = "0";
  previousValue     = null;
  currentOperator   = null;
  waitingForOperand = false;
  justCalculated    = false;

  clearOperatorSelection();
  updateExpression("");
  updateDisplay();
}


/* =========================================================
   TRASH ANIMATION
   ========================================================= */

function animateTrash() {

  const button = document.querySelector(".key--delete");

  if (!button) return;

  button.classList.remove("is-animating");

  void button.offsetWidth;

  button.classList.add("is-animating");

  setTimeout(() => {
    button.classList.remove("is-animating");
  }, 320);
}


/* =========================================================
   OPERATOR UI
   ========================================================= */

function setActiveOperator(operator) {

  clearOperatorSelection();

  const button = document.querySelector(`[data-operator="${operator}"]`);

  if (button) button.classList.add("is-active");
}


function clearOperatorSelection() {

  operatorButtons.forEach(button => {
    button.classList.remove("is-active");
  });
}


/* =========================================================
   SHORTCUT ENGINE — Smart Shortcuts
   ========================================================= */

const SHORTCUT_RULES = {
  "iva":        { fn: v => v * 1.21,  expr: v => `${v} + IVA` },
  "minus-iva":  { fn: v => v / 1.21,  expr: v => `${v} − IVA` },
  "percent-10": { fn: v => v * 0.10,  expr: v => `10% de ${v}` },
  "percent-20": { fn: v => v * 0.20,  expr: v => `20% de ${v}` },
  "plus-10":    { fn: v => v * 1.10,  expr: v => `${v} + 10%` },
  "minus-10":   { fn: v => v * 0.90,  expr: v => `${v} − 10%` },
  "plus-20":    { fn: v => v * 1.20,  expr: v => `${v} + 20%` },
  "minus-20":   { fn: v => v * 0.80,  expr: v => `${v} − 20%` },
  "plus-21":    { fn: v => v * 1.21,  expr: v => `${v} + 21%` },
  "minus-21":   { fn: v => v * 0.79,  expr: v => `${v} − 21%` },
  "tip":        { fn: v => v * 1.10,  expr: v => `${v} + propina 10%` },
  "split":      { fn: v => v / 2,     expr: v => `${v} ÷ 2 personas` }
};


function applyShortcut(shortcut) {

  if (currentValue === "Error") return;

  const rule = SHORTCUT_RULES[shortcut];

  if (!rule) return;

  const value = parseFloat(currentValue);

  if (!Number.isFinite(value)) return;

  const rawResult = rule.fn(value);
  const result    = cleanNumber(rawResult);
  const expression = rule.expr(formatDisplayValue(currentValue));

  applyImmediateResult(expression, result);
}


/* =========================================================
   IMMEDIATE RESULT — helper for shortcuts & unary sci
   ========================================================= */

function applyImmediateResult(expression, result) {

  currentValue      = result;
  previousValue     = null;
  currentOperator   = null;
  waitingForOperand = false;
  justCalculated    = true;

  clearOperatorSelection();

  updateExpression(expression);

  displayElement.textContent = formatDisplayValue(currentValue);

  requestAnimationFrame(() => {
    fitDisplayNumber();
  });

  animateDisplay("is-result");

  if (result !== "Error") {
    pushHistory(expression, currentValue);
  }
}


/* =========================================================
   SCIENTIFIC ENGINE
   ========================================================= */

/*
 * Scientific mode:
 * - Unary functions (sin, cos, tan, asin, acos, atan, log, ln, sqrt, square)
 *   apply immediately to currentValue.
 * - power (x^y) uses chooseOperator("^") to become a binary operator.
 * - pi and e set currentValue.
 * - ( and ) build an expression buffer evaluated on "=".
 *
 * Trigonometric functions work in DEGREES for user friendliness.
 */

let sciExpression   = "";
let sciExprMode     = false;


function applyScientific(op) {

  if (currentValue === "Error" && op !== "paren-open") {
    resetCalculator();
  }

  if (sciExprMode) {
    handleSciExprInput(op);
    return;
  }

  const value = parseFloat(currentValue);

  switch (op) {

    case "sin":  return sciUnary(op, v => Math.sin(toRadians(v)),  v => `sin(${v}°)`);
    case "cos":  return sciUnary(op, v => Math.cos(toRadians(v)),  v => `cos(${v}°)`);
    case "tan":  return sciUnary(op, v => Math.tan(toRadians(v)),  v => `tan(${v}°)`);

    case "asin": return sciUnary(op, v => toDegrees(Math.asin(v)), v => `sin⁻¹(${v})`);
    case "acos": return sciUnary(op, v => toDegrees(Math.acos(v)), v => `cos⁻¹(${v})`);
    case "atan": return sciUnary(op, v => toDegrees(Math.atan(v)), v => `tan⁻¹(${v})`);

    case "log":  return sciUnary(op, v => Math.log10(v),           v => `log(${v})`);
    case "ln":   return sciUnary(op, v => Math.log(v),             v => `ln(${v})`);
    case "sqrt": return sciUnary(op, v => Math.sqrt(v),            v => `√${v}`);
    case "square": return sciUnary(op, v => v * v,                 v => `${v}²`);

    case "power":

      chooseOperator("^");
      return;

    case "pi":
      currentValue   = cleanNumber(Math.PI);
      justCalculated = true;
      updateExpression("π");
      updateDisplay(true);
      return;

    case "e":
      currentValue   = cleanNumber(Math.E);
      justCalculated = true;
      updateExpression("e");
      updateDisplay(true);
      return;

    case "paren-open":

      enterSciExprMode();
      handleSciExprInput("paren-open");
      return;

    case "paren-close":

      enterSciExprMode();
      handleSciExprInput("paren-close");
      return;
  }

  /*
   * silence unused parameter warning
   */
  void value;
}


function sciUnary(_id, fn, exprFn) {

  const value = parseFloat(currentValue);

  if (!Number.isFinite(value)) return;

  const raw    = fn(value);
  const result = cleanNumber(raw);
  const expr   = exprFn(formatDisplayValue(currentValue));

  applyImmediateResult(expr, result);
}


function toRadians(deg) { return (deg * Math.PI) / 180; }
function toDegrees(rad) { return (rad * 180) / Math.PI; }


/* =========================================================
   SCIENTIFIC EXPRESSION MODE
   ========================================================= */

function enterSciExprMode() {

  if (sciExprMode) return;

  sciExprMode   = true;

  /*
   * Seed the expression with the current visible number
   * when we start a paren expression from an existing value.
   */
  const seed = (currentValue === "0" || justCalculated)
    ? ""
    : currentValue;

  sciExpression = seed;
}


function exitSciExprMode() {

  sciExprMode   = false;
  sciExpression = "";
}


function handleSciExprInput(op) {

  switch (op) {
    case "paren-open":  sciExpression += "("; break;
    case "paren-close": sciExpression += ")"; break;
  }

  renderSciExpression();
}


function renderSciExpression() {

  if (!sciExprMode) return;

  const shown = sciExpression.length ? sciExpression : "0";

  displayElement.textContent = shown;

  requestAnimationFrame(() => fitDisplayNumber());
}


/*
 * Adapter for numbers/operators while in sci expression mode:
 * intercept in inputNumber / chooseOperator / inputDecimal.
 */

function sciExprAppend(token) {

  sciExpression += token;
  renderSciExpression();
}


function evaluateSciExpression() {

  if (!sciExprMode) return;

  const raw = sciExpression.trim();

  if (!raw) {
    exitSciExprMode();
    updateDisplay();
    return;
  }

  try {

    /*
     * Sanitize: only allow digits, operators, parens, decimal and
     * substitute × ÷ − with * / -. No identifiers allowed.
     */

    let expr = raw
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-")
      .replace(/,/g, ".")
      .replace(/\^/g, "**");

    if (!/^[0-9+\-*/().* ]+$/.test(expr)) {
      throw new Error("bad chars");
    }

    /* eslint-disable no-new-func */
    const result = Function(`"use strict"; return (${expr});`)();
    /* eslint-enable no-new-func */

    if (!Number.isFinite(result)) throw new Error("infinite");

    const clean = cleanNumber(result);
    const shown = raw;

    exitSciExprMode();

    applyImmediateResult(shown, clean);

  } catch (err) {

    exitSciExprMode();

    currentValue   = "Error";
    justCalculated = true;

    updateExpression("Expresión no válida");
    updateDisplay();
  }
}


/* =========================================================
   HISTORY
   ========================================================= */

function loadHistory() {

  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}


function saveHistory() {

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
  } catch (e) {
    /* localStorage no disponible: ignoramos */
  }
}


function pushHistory(expression, resultRaw) {

  if (!expression || resultRaw === "Error") return;

  const item = {
    expression,
    resultRaw,
    resultDisplay: formatDisplayValue(resultRaw),
    ts: Date.now()
  };

  historyItems.unshift(item);

  if (historyItems.length > HISTORY_LIMIT) {
    historyItems = historyItems.slice(0, HISTORY_LIMIT);
  }

  saveHistory();
  renderHistory();
}


function renderHistory() {

  historyList.innerHTML = "";

  if (historyItems.length === 0) {
    const empty = document.createElement("p");
    empty.className   = "history-empty";
    empty.textContent = "Aún no hay operaciones";
    historyList.appendChild(empty);
    return;
  }

  historyItems.forEach((item, idx) => {

    const button = document.createElement("button");
    button.type        = "button";
    button.className   = "history-item";
    button.setAttribute("aria-label",
      `Recuperar ${item.expression} igual a ${item.resultDisplay}`
    );
    button.style.animationDelay = `${Math.min(idx * 24, 240)}ms`;

    const expr = document.createElement("span");
    expr.className   = "history-item__expression";
    expr.textContent = item.expression;

    const res = document.createElement("span");
    res.className   = "history-item__result";
    res.textContent = item.resultDisplay;

    button.appendChild(expr);
    button.appendChild(res);

    button.addEventListener("click", () => {
      recallFromHistory(item);
    });

    historyList.appendChild(button);
  });
}


function clearHistory() {

  historyItems = [];
  saveHistory();
  renderHistory();
}


function recallFromHistory(item) {

  currentValue      = item.resultRaw;
  previousValue     = null;
  currentOperator   = null;
  waitingForOperand = false;
  justCalculated    = true;

  clearOperatorSelection();
  updateExpression(item.expression);

  closeHistoryScreen();

  requestAnimationFrame(() => {
    updateDisplay();
    animateDisplay("is-result");
  });
}


/* =========================================================
   HISTORY SCREEN
   ========================================================= */

function openHistoryScreen() {

  panelBeforeHistory = activePanel;
  renderHistory();
  historyScreen.classList.add("is-open");
  historyScreen.setAttribute("aria-hidden", "false");
}


function closeHistoryScreen() {

  historyScreen.classList.remove("is-open");
  historyScreen.setAttribute("aria-hidden", "true");

  /*
   * Restaurar el panel previo (sin animación de arrastre).
   */
  setActivePanel(panelBeforeHistory, true);
}


/* =========================================================
   PANEL NAVIGATION
   ========================================================= */

function panelIndex(panel) {
  const idx = PANELS.indexOf(panel);
  return idx < 0 ? 1 : idx;
}


function setActivePanel(panel, immediate = false) {

  if (!PANELS.includes(panel)) panel = "calculator";

  activePanel = panel;

  const idx     = panelIndex(panel);
  const offset  = -(idx * 33.3333);

  if (immediate) {
    interactionTrack.style.transition = "none";
    interactionTrack.style.transform  = `translateX(${offset}%)`;
    /* forzar reflow y restaurar */
    void interactionTrack.offsetWidth;
    interactionTrack.style.transition = "";
  } else {
    interactionTrack.style.transform = `translateX(${offset}%)`;
  }

  panelIndicators.forEach(indicator => {
    indicator.classList.toggle(
      "is-active",
      indicator.dataset.indicator === panel
    );
  });
}


/* =========================================================
   SWIPE HANDLING — ROBUST TOUCH VERSION
   ========================================================= */

let swipePointerId = null;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeCurrentX = 0;
let swipeDragging = false;


/*
 * POINTER DOWN
 *
 * Los botones quedan completamente fuera del sistema
 * de swipe. Un toque sobre un botón pertenece al botón.
 */

interactionArea.addEventListener("pointerdown", event => {

  if (event.target.closest("button")) {
    return;
  }

  if (
    event.pointerType === "mouse" &&
    event.button !== 0
  ) {
    return;
  }

  swipePointerId = event.pointerId;

  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipeCurrentX = event.clientX;

  swipeDragging = false;

  /*
   * Capturamos este puntero para que el pointerup
   * llegue siempre a esta misma interacción aunque
   * el dedo salga ligeramente del área.
   */

  try {
    interactionArea.setPointerCapture(event.pointerId);
  } catch (error) {
    // Algunos navegadores pueden no soportarlo.
  }
});


/*
 * POINTER MOVE
 */

interactionArea.addEventListener("pointermove", event => {

  if (
    swipePointerId === null ||
    event.pointerId !== swipePointerId
  ) {
    return;
  }

  swipeCurrentX = event.clientX;

  const deltaX =
    swipeCurrentX - swipeStartX;

  const deltaY =
    event.clientY - swipeStartY;

  const horizontalDistance =
    Math.abs(deltaX);

  const verticalDistance =
    Math.abs(deltaY);


  /*
   * Todavía no sabemos si es un swipe.
   *
   * Si el movimiento es pequeño o principalmente
   * vertical, no hacemos absolutamente nada.
   */

  if (
    horizontalDistance < 14 ||
    horizontalDistance <= verticalDistance
  ) {
    return;
  }


  /*
   * Desde aquí sabemos que realmente estamos
   * haciendo un swipe horizontal.
   */

  swipeDragging = true;

  event.preventDefault();

  interactionTrack.classList.add("is-dragging");


  const areaWidth =
    interactionArea.clientWidth;

  if (!areaWidth) {
    return;
  }


  const currentIndex =
    panelIndex(activePanel);

  const baseOffset =
    -(currentIndex * areaWidth);


  let offset =
    baseOffset + deltaX;


  const minimumOffset =
    -((PANELS.length - 1) * areaWidth);

  const maximumOffset =
    0;


  /*
   * Resistencia en los extremos.
   */

  if (offset > maximumOffset) {

    const over =
      offset - maximumOffset;

    offset =
      maximumOffset + over * 0.25;

  } else if (offset < minimumOffset) {

    const over =
      minimumOffset - offset;

    offset =
      minimumOffset - over * 0.25;
  }


  interactionTrack.style.transform =
    `translateX(${offset}px)`;
});


/*
 * FIN DEL GESTO
 */

function endPointerGesture(event) {

  if (
    swipePointerId === null ||
    event.pointerId !== swipePointerId
  ) {
    return;
  }


  const deltaX =
    swipeCurrentX - swipeStartX;

  const wasDragging =
    swipeDragging;


  /*
   * Limpiamos SIEMPRE el estado antes de
   * ejecutar cualquier cambio de panel.
   *
   * Esto es importante para que el siguiente
   * toque empiece completamente limpio.
   */

  swipePointerId = null;
  swipeDragging = false;


  interactionTrack.classList.remove(
    "is-dragging"
  );


  /*
   * Liberar captura del puntero.
   */

  try {

    if (
      interactionArea.hasPointerCapture &&
      interactionArea.hasPointerCapture(event.pointerId)
    ) {
      interactionArea.releasePointerCapture(
        event.pointerId
      );
    }

  } catch (error) {
    // Nada que hacer si el navegador ya lo liberó.
  }


  /*
   * Si simplemente hemos tocado la zona sin
   * arrastrar, no hacemos nada.
   *
   * Esto evita que un toque normal sea
   * interpretado como navegación.
   */

  if (!wasDragging) {
    return;
  }


  const threshold = 45;

  const currentIndex =
    panelIndex(activePanel);

  let targetIndex =
    currentIndex;


  /*
   * Swipe hacia la izquierda
   */

  if (
    deltaX < -threshold &&
    currentIndex < PANELS.length - 1
  ) {

    targetIndex =
      currentIndex + 1;
  }


  /*
   * Swipe hacia la derecha
   */

  else if (
    deltaX > threshold &&
    currentIndex > 0
  ) {

    targetIndex =
      currentIndex - 1;
  }


  /*
   * Cambiar de panel.
   */

  if (targetIndex !== currentIndex) {

    setActivePanel(
      PANELS[targetIndex]
    );

  } else {

    /*
     * No llegó al umbral:
     * volvemos al panel actual.
     */

    setActivePanel(
      activePanel
    );
  }
}


/*
 * POINTER UP
 */

interactionArea.addEventListener(
  "pointerup",
  endPointerGesture
);


/*
 * POINTER CANCEL
 */

interactionArea.addEventListener(
  "pointercancel",
  endPointerGesture
);


/*
 * Si el puntero desaparece por cualquier motivo,
 * limpiamos el estado para que el siguiente toque
 * empiece desde cero.
 */

interactionArea.addEventListener(
  "lostpointercapture",
  event => {

    if (
      swipePointerId !== null &&
      event.pointerId === swipePointerId
    ) {

      swipePointerId = null;
      swipeDragging = false;

      interactionTrack.classList.remove(
        "is-dragging"
      );
    }
  }
);

/* =========================================================
   BUTTON EVENTS
   ========================================================= */

numberButtons.forEach(button => {
  button.addEventListener("click", () => {

    if (sciExprMode) {
      sciExprAppend(button.dataset.number);
      return;
    }

    inputNumber(button.dataset.number);
  });
});


operatorButtons.forEach(button => {
  button.addEventListener("click", () => {

    if (sciExprMode) {
      const op = button.dataset.operator;
      sciExprAppend(operatorSymbol(op));
      return;
    }

    chooseOperator(button.dataset.operator);
  });
});


actionButtons.forEach(button => {

  button.addEventListener("click", () => {

    const action = button.dataset.action;

    switch (action) {

      case "clear":

        animateTrash();
        exitSciExprMode();
        resetCalculator();
        break;

      case "decimal":

        if (sciExprMode) {
          sciExprAppend(",");
        } else {
          inputDecimal();
        }
        break;

      case "sign":

        toggleSign();
        break;

      case "percent":

        percentage();
        break;

      case "backspace":

        if (sciExprMode) {
          sciExpression = sciExpression.slice(0, -1);
          if (!sciExpression) exitSciExprMode();
          renderSciExpression();
        } else {
          backspace();
        }
        break;

      case "equals":

        if (sciExprMode) {
          evaluateSciExpression();
        } else {
          calculate();
        }
        break;

      case "open-history":

        openHistoryScreen();
        break;

      case "close-history":

        closeHistoryScreen();
        break;

      case "clear-history":

        clearHistory();
        break;
    }
  });
});


shortcutButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyShortcut(button.dataset.shortcut);
  });
});


scientificButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyScientific(button.dataset.sci);
  });
});


/* =========================================================
   KEYBOARD
   ========================================================= */

document.addEventListener("keydown", event => {

  /* Escape en historial: cerrarlo */
  if (
    event.key === "Escape" &&
    historyScreen.classList.contains("is-open")
  ) {
    event.preventDefault();
    closeHistoryScreen();
    return;
  }

  const key = event.key;

  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    if (sciExprMode) sciExprAppend(key);
    else inputNumber(key);
    return;
  }

  if (key === "." || key === ",") {
    event.preventDefault();
    if (sciExprMode) sciExprAppend(",");
    else inputDecimal();
    return;
  }

  if (key === "+" || key === "-" || key === "*" || key === "/") {
    event.preventDefault();
    if (sciExprMode) sciExprAppend(operatorSymbol(key));
    else chooseOperator(key);
    return;
  }

  if (key === "(") {
    event.preventDefault();
    applyScientific("paren-open");
    return;
  }

  if (key === ")") {
    event.preventDefault();
    applyScientific("paren-close");
    return;
  }

  if (key === "^") {
    event.preventDefault();
    applyScientific("power");
    return;
  }

  if (key === "Enter" || key === "=") {
    event.preventDefault();
    if (sciExprMode) evaluateSciExpression();
    else calculate();
    return;
  }

  if (key === "Backspace") {
    event.preventDefault();
    if (sciExprMode) {
      sciExpression = sciExpression.slice(0, -1);
      if (!sciExpression) exitSciExprMode();
      renderSciExpression();
    } else {
      backspace();
    }
    return;
  }

  if (key === "Escape" || key === "Delete") {
    event.preventDefault();
    animateTrash();
    exitSciExprMode();
    resetCalculator();
    return;
  }

  if (key === "%") {
    event.preventDefault();
    percentage();
    return;
  }

  /* Flechas para navegar entre paneles */
  if (key === "ArrowLeft") {
    const idx = panelIndex(activePanel);
    if (idx > 0) {
      event.preventDefault();
      setActivePanel(PANELS[idx - 1]);
    }
    return;
  }

  if (key === "ArrowRight") {
    const idx = panelIndex(activePanel);
    if (idx < PANELS.length - 1) {
      event.preventDefault();
      setActivePanel(PANELS[idx + 1]);
    }
    return;
  }
});


/* =========================================================
   RESIZE
   ========================================================= */

function handleViewportChange() {

  requestAnimationFrame(() => {

    if (typeof updateAppViewportHeight === "function") {
      updateAppViewportHeight();
    }

    fitDisplayNumber();

    setActivePanel(activePanel, true);
  });
}


window.addEventListener("resize", handleViewportChange);
window.addEventListener("orientationchange", handleViewportChange);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", handleViewportChange);
}


/* =========================================================
   VIEWPORT HEIGHT FIX (móviles con 100vh problemático)
   Actualizamos --app-vh en :root según window.innerHeight real.
   ========================================================= */

function updateAppViewportHeight() {

  const h = (window.visualViewport && window.visualViewport.height) ||
            window.innerHeight ||
            document.documentElement.clientHeight;

  if (h && Number.isFinite(h)) {
    document.documentElement.style.setProperty("--app-vh", `${h}px`);
  }
}

updateAppViewportHeight();

window.addEventListener("resize", updateAppViewportHeight);
window.addEventListener("orientationchange", updateAppViewportHeight);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateAppViewportHeight);
}


/* =========================================================
   SERVICE WORKER — PWA
   ========================================================= */

if ("serviceWorker" in navigator) {

  window.addEventListener("load", () => {

    navigator.serviceWorker
      .register("./service-worker.js")
      .catch(() => {
        /* Registro fallido: la app sigue funcionando sin offline */
      });
  });
}


/* =========================================================
   INITIAL STATE
   ========================================================= */

setActivePanel("calculator", true);
updateDisplay();
renderHistory();
