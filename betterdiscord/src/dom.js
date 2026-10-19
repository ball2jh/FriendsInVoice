export function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

export function button(label, onClick, className = "") {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
}

export function paragraph(text, className = "") { return element("p", className, text); }

export function add(parent, ...children) {
    for (const child of children) if (child) parent.append(child);
    return parent;
}

export function heading(text, level = 3) { return element(`h${level}`, "", text); }
