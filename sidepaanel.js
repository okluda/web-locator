const locateButton = document.getElementById('locateButton');
const statusText = document.getElementById('statusText');
const statusBox = document.getElementById('statusBox');
const modeBadge = document.getElementById('modeBadge');

let isLocating = false;

locateButton.addEventListener('click', function () {
    isLocating = !isLocating;

    if (isLocating) {
        locateButton.textContent = '停止定位';

        locateButton.setAttribute('aria-pressed', 'true');

        locateButton.classList.add("primary-button-active");
        statusText.textContent = '正在定位...';
        statusBox.classList.add('status-box-active');
        modeBadge.textContent = '定位中';
        modeBadge.classList.add('mode-badge-active');
    }