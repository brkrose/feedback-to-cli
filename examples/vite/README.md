# feedback-to-cli in Vite

Add the script tag in `index.html` (Vite serves it directly):

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
  <script src="https://unpkg.com/feedback-to-cli@1" data-namespace="my-app"></script>
</body>
```

Wrap in a conditional if you want to keep it out of production builds:

```html
<!-- only loads when running `vite dev`, not in built output -->
<script>
  if (location.hostname === "localhost") {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/feedback-to-cli@1";
    s.dataset.namespace = "my-app";
    document.body.appendChild(s);
  }
</script>
```

Run the companion from project root:

```bash
npx feedback-to-cli serve
```
