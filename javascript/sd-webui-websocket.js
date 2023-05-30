const toSend = [];
const toReceive = [];

function getTargetTab() {
    return 'txt2img';
}

function refresh() {
    // const tab = getTargetTab();
    const tabs = ['txt2img', 'img2img']
    tabs.forEach(tab => {
        const textarea = gradioApp().querySelector(`#sd-webui-websocket_${tab}_send textarea`);
        const refreshButton = gradioApp().querySelector(`#sd-webui-websocket_${tab}_refresh_btn`);
        // if exist
        if (textarea !== null && refreshButton !== null) {
            refreshButton.click();
        }
    });
}

function addToSend() {
    const tabs = ['txt2img', 'img2img']
    tabs.forEach(tab => {
        const textarea = gradioApp().querySelector(`#sd-webui-websocket_${tab}_send textarea`);
        const sendButton = gradioApp().querySelector(`#sd-webui-websocket_${tab}_send_btn`);
        // if exist
        if (textarea !== null && sendButton !== null) {
            if (toSend.length > 0) {
                if (textarea.value === '') {
                    textarea.value = toSend.join('\n');
                }
                else {
                    textarea.value += '\n' + toSend.join('\n');;
                }
                const inputEvent = new Event('input');
                Object.defineProperty(inputEvent, 'target', { value: textarea });
                textarea.dispatchEvent(inputEvent);
                toSend.splice(0, toSend.length);
            }
            if (textarea.value !== '') {
                sendButton.click();
            }
        }
    })
}

function addToReceive() {
    const tab = getTargetTab();
    const textarea = gradioApp().querySelector(`#sd-webui-websocket_${tab}_receive textarea`);
    const receiveButton = gradioApp().querySelector(`#sd-webui-websocket_${tab}_receive_btn`);
    if (textarea !== null && receiveButton !== null) {
        if (textarea.value === '') {
            textarea.value = toReceive.join('\n');
        }
        else {
            textarea.value += '\n' + toReceive.join('\n');
        }
        const inputEvent = new Event('input');
        Object.defineProperty(inputEvent, 'target', { value: textarea });
        textarea.dispatchEvent(inputEvent);
        receiveButton.click();
    }
}

let ws = null;

// receive and send
function sync() {
    const tab = getTargetTab();
    // check enable status
    const enable = gradioApp().querySelector(`#sd-webui-websocket_${tab}_enable input`).checked;
    if (!enable) {
        return;
    }
    // if loading
    const receiveWrap = gradioApp().querySelector(`#sd-webui-websocket_${tab}_receive .wrap`);
    if (receiveWrap && !receiveWrap.classList.contains('hide')) {
        return;
    }
    const sendWrap = gradioApp().querySelector(`#sd-webui-websocket_${tab}_send .wrap`);
    if (sendWrap && !sendWrap.classList.contains('hide')) {
        return;
    }
    // if has refreshed
    const sendTextarea = gradioApp().querySelector(`#sd-webui-websocket_${tab}_send textarea`);
    const sendTextareaImg2img = gradioApp().querySelector(`#sd-webui-websocket_img2img_send textarea`);
    // receive
    if (toReceive.length > 0) {
        addToReceive();
        toReceive.splice(0, toReceive.length);
    }
    // send
    else if (toSend.length > 0 || sendTextarea.value !== '' || sendTextareaImg2img.value !== '') {
        addToSend();
    }
    // refresh
    else {
        refresh();
    }
}
async function toBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            resolve(reader.result);
        };
        reader.onerror = reject;
    });
}
async function getElementValue(input) {
    let type = '';
    let value = '';
    if (input instanceof HTMLInputElement) {
        type = input.type;
        if (input.type === 'checkbox' || input.type === 'radio') {
            value = input.checked;
        }
        else if (input.type === 'number') {
            value = input.valueAsNumber;
        } else if (input.type === 'file') {
            if (input.files.length === 1) {
                value = await toBase64(input.files[0]);
            } else {
                // all files
                const files = [];
                for (let i = 0; i < input.files.length; i++) {
                    files.push(input.files[i]);
                }
                value = await Promise.all(files.map(async x => await toBase64(x)));
            }
        }
        else {
            value = input.value;
        }
    } else if (input instanceof HTMLTextAreaElement) {
        type = 'textarea';
        value = input.value;
    } else if (input instanceof HTMLButtonElement) {
        type = 'button';
        value = input.innerText;
    } else if (input instanceof HTMLImageElement){
        type = 'image';
        // HTMLImageElement to base64
        const canvas = document.createElement('canvas');
        canvas.width = input.naturalWidth;
        canvas.height = input.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(input, 0, 0);
        value = canvas.toDataURL();
        canvas.remove();
    } else if (input instanceof HTMLElement) {
        type = 'other';
        value = input.innerHTML;
    }
    return [type, value];
}
async function getUI(request) {
    const query = request.query;
    if (!query) {
        return {
            'id': request.id,
            'type': 'response_get_ui',
            'status': 'error',
            'message': 'query is empty'
        }
    }
    const input = gradioApp().querySelector(query);
    if (!input) {
        return {
            'id': request.id,
            'type': 'response_get_ui',
            'status': 'error',
            'message': 'element not found'
        }
    }
    const [type, value] = await getElementValue(input);
    return {
        'id': request.id,
        'type': 'response_get_ui',
        'status': 'success',
        "element": {
            'type': type,
            'value': value
        }
    };
}
async function getAllUI(request) {
    const currentTab = get_uiCurrentTab().textContent;
    const tabs = document.querySelectorAll('#tabs > *');
    const elements = [];

    tabs.forEach(tab => {
        const inputs = tab.querySelectorAll('input, textarea, button, img');
        inputs.forEach(async input => {
            const id = input.closest('[id]').id;
            const ancestorIds = [];
            let currentElement = input;
            while (currentElement.parentElement) {
                const ancestorId = currentElement.parentElement.id;
                if (ancestorId) {
                    ancestorIds.push(ancestorId);
                }
                currentElement = currentElement.parentElement;
            }
            const [type, value] = await getElementValue(input);
            elements.push({
                tab: tab.id,
                id: id,
                ancestorIds: ancestorIds.reverse(),
                type: type,
                value: value
            })
        });
    });

    return {
        'id': request.id,
        'type': 'response_get_all_ui',
        'status': 'success',
        'currentTab': currentTab,
        'elements': elements
    }
}

function dispatchInputEvent(element, value) {
    let eventName = 'input';
    if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox') {
            if(typeof(value) === 'boolean'){
                element.checked = value;
            }else if(typeof(value) === 'string'){
                element.checked = value === 'true';
            }
        }
        else if (element.type === 'radio') {
            element.checked = value;
        }
        else if (element.type === 'number') {
            if (typeof (value) === 'number') {
                element.valueAsNumber = value;
            } else {
                element.value = value;
            }
        } else if (element.type === 'file') {
            var file = dataURLtoFile(value);
            const container = new DataTransfer();
            container.items.add(file);
            element.files = container.files;
            eventName = 'change';
        } else if (element.parentElement && element.parentElement.querySelector(".dropdown-arrow")) {
            element.value = "";
            element.dispatchEvent(new Event("input"));
            element.dispatchEvent(new Event("focus"));
            setTimeout(() => {
                const ul = element.parentElement?.parentElement?.parentElement?.querySelector("ul");
                if (ul) {
                    const li = ul.querySelector(`li[data-value="${value}"]`);
                    if (li) {
                        li.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                        return;
                    } else {
                        element.dispatchEvent(new Event("blur"));
                        throw new Error("Dropdown value not found");
                    }
                } else {
                    element.dispatchEvent(new Event("blur"));
                    throw new Error("Dropdown not found");
                }
            }, 100);
        } else {
            element.value = value;
        }
    }
    else if (element instanceof HTMLTextAreaElement) {
        element.value = value;
    }
    else if (element instanceof HTMLButtonElement) {
        element.click();
    }
    const inputEvent = new Event(eventName);
    Object.defineProperty(inputEvent, 'target', { value: element });
    element.dispatchEvent(inputEvent);
}
function dataURLtoFile(dataurl) {
    var arr = dataurl.split(','),
        mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]),
        n = bstr.length,
        u8arr = new Uint8Array(n);

    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    let filename = 'image.png';
    if (mime.startsWith('image/')) {
        filename = 'image.' + mime.split('/')[1];
    }
    return new File([u8arr], filename, { type: mime });
}
function setUI(request) {
    const query = request.query;
    const value = request.value;
    if (!query) {
        return {
            'id': request.id,
            'type': 'response_set_ui',
            'status': 'error',
            'message': 'query is empty'
        }
    }
    const element = document.querySelector(query);
    if (!element) {
        return {
            'id': request.id,
            'type': 'response_set_ui',
            'status': 'error',
            'message': 'element not found'
        }
    }
    try {
        dispatchInputEvent(element, value);
    }
    catch (e) {
        return {
            'id': request.id,
            'type': 'response_set_ui',
            'status': 'error',
            'message': e.message
        }
    }
    return {
        'id': request.id,
        'type': 'response_set_ui',
        'status': 'success'
    }
}

function openWebsocket(route) {
    const ws = new WebSocket(route);
    ws.onopen = function () {
        toSend.push(JSON.stringify({ type: 'open' }));
    }
    ws.onmessage = async function (e) {
        toReceive.push(e.data);
        const msg = JSON.parse(e.data);
        if (msg.type === 'get_ui') {
            toSend.push(JSON.stringify(await getUI(msg)));
        }
        else if (msg.type === 'get_all_ui') {
            toSend.push(JSON.stringify(await getAllUI(msg)));
        }
        else if (msg.type === 'set_ui') {
            toSend.push(JSON.stringify(setUI(msg)));
        }
    }
    ws.onclose = function () {
        toReceive.push(JSON.stringify({ type: 'close' }));
    }
    ws.onerror = function () {
        toReceive.push(JSON.stringify({ type: 'error' }));
    }
    return ws;
}

function closeWebsocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
}

function onEnableChange(e) {
    const tab = e.target.parentElement.parentElement.id.split("_")[1];
    const route = gradioApp().querySelector(`#sd-webui-websocket_${tab}_route textarea`)
    if (e.target.checked) {
        const routeUrl = route.value;
        localStorage.setItem(`sd-webui-websocket_${tab}_route`, routeUrl);
        ws = openWebsocket(routeUrl);
        route.disabled = true;
    }
    else {
        closeWebsocket();
        route.disabled = false;
    }
}

function watchSendButton() {
    const tabs = ['txt2img', 'img2img'];
    for (let tab of tabs) {
        const sendButton = gradioApp().querySelector(`#sd-webui-websocket_${tab}_send_btn`);
        if (sendButton.hasAttribute("sd-webui-websocket-event-added")) {
            return;
        }
        sendButton.addEventListener("click", function () {
            const textarea = gradioApp().querySelector(`#sd-webui-websocket_${tab}_send textarea`);
            if (ws && textarea.value !== '') {
                // split lines
                const lines = textarea.value.split('\n');
                for (let line of lines) {
                    ws.send(line);
                }
            }
        });
        sendButton.setAttribute("sd-webui-websocket-event-added", "true");
    }
}

function watchEnableCheckbox() {
    const tabs = ['txt2img'];
    for (let tab of tabs) {
        // get input child
        const checkbox = gradioApp().querySelector(`#sd-webui-websocket_${tab}_enable input[type=checkbox]`)
        const route = gradioApp().querySelector(`#sd-webui-websocket_${tab}_route textarea`)
        // load route from local storage
        const routeUrl = localStorage.getItem(`sd-webui-websocket_${tab}_route`);
        if (routeUrl && route.value === 'ws://example.com') {
            route.value = routeUrl;
        }
        // check if event has added
        if (checkbox.hasAttribute("sd-webui-websocket-event-added")) {
            return;
        }
        checkbox.addEventListener("change", onEnableChange);
        checkbox.setAttribute("sd-webui-websocket-event-added", "true");
    }
}

function init() {
    try {
        watchEnableCheckbox();
        watchSendButton();
        console.log('sd-webui-websocket init success');
        setInterval(sync, 1000);
    }
    catch (e) {
        // console.log(e);
        // try again
        setTimeout(init, 3000);
    }
}

document.addEventListener("DOMContentLoaded", () => setTimeout(init, 1000));
