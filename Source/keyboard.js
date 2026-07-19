const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.'],
  ['space', '-', 'back', 'done']
];

let oskTarget = null;
let oskShift = false;

function buildKeyboard() {
  const osk = document.createElement('div');
  osk.className = 'osk';
  osk.id = 'osk';
  osk.innerHTML = KEY_ROWS.map(
    (row) =>
      `<div class="osk-row">${row
        .map((key) => {
          if (key === 'space') return `<button class="osk-key wide" data-key=" ">space</button>`;
          if (key === 'back') return `<button class="osk-key med" data-key="\\b">&#9003;</button>`;
          if (key === 'shift') return `<button class="osk-key med" id="osk-shift" data-key="\\s">&#8679;</button>`;
          if (key === 'done') return `<button class="osk-key med accent" data-key="\\n">done</button>`;
          return `<button class="osk-key" data-key="${key}">${key}</button>`;
        })
        .join('')}</div>`
  ).join('');
  document.body.appendChild(osk);

  osk.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const button = event.target.closest('.osk-key');
    if (button) pressKey(button.dataset.key);
  });
}

function setShift(state) {
  oskShift = state;
  document.getElementById('osk-shift').classList.toggle('active', oskShift);
  document.querySelectorAll('.osk-key').forEach((k) => {
    const value = k.dataset.key;
    if (value && value.length === 1 && /[a-z]/i.test(value)) {
      k.innerText = oskShift ? value.toUpperCase() : value.toLowerCase();
    }
  });
}

function pressKey(key) {
  if (!oskTarget) return;

  if (key === '\\n') {
    hideKeyboard();
    return;
  }

  if (key === '\\s') {
    setShift(!oskShift);
    return;
  }

  const start = oskTarget.selectionStart ?? oskTarget.value.length;
  const end = oskTarget.selectionEnd ?? oskTarget.value.length;

  if (key === '\\b') {
    if (start === end && start > 0) {
      oskTarget.value = oskTarget.value.slice(0, start - 1) + oskTarget.value.slice(end);
      oskTarget.setSelectionRange(start - 1, start - 1);
    } else {
      oskTarget.value = oskTarget.value.slice(0, start) + oskTarget.value.slice(end);
      oskTarget.setSelectionRange(start, start);
    }
  } else {
    const char = oskShift ? key.toUpperCase() : key;
    oskTarget.value = oskTarget.value.slice(0, start) + char + oskTarget.value.slice(end);
    oskTarget.setSelectionRange(start + char.length, start + char.length);
    if (oskShift) setShift(false);
  }

  oskTarget.dispatchEvent(new Event('input', { bubbles: true }));
}

function showKeyboard(target) {
  oskTarget = target;
  const osk = document.getElementById('osk');
  osk.classList.add('open');
  document.body.classList.add('osk-open');
  document.documentElement.style.setProperty('--osk-height', `${osk.offsetHeight}px`);
  setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
}

function hideKeyboard() {
  document.getElementById('osk').classList.remove('open');
  document.body.classList.remove('osk-open');
  if (oskTarget) oskTarget.blur();
  oskTarget = null;
}

document.addEventListener('focusin', (event) => {
  const el = event.target;
  const isText = el.matches('input[type="text"], textarea');
  if (isText) showKeyboard(el);
  else if (!el.closest('.osk')) hideKeyboard();
});

buildKeyboard();
