const testButton = document.getElementById("testButton");
const statusText = document.getElementById("status");

testButton.addEventListener("click", function () {
    statusText.textContent = "測試成功：JavaScript 可以正常執行。";
});