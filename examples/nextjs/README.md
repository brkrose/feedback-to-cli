# feedback-to-cli in Next.js

Add the script tag in `app/layout.tsx`, gated to development:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === "development" && (
          <script
            src="https://unpkg.com/feedback-to-cli@1"
            data-namespace="my-app"
            async
          />
        )}
      </body>
    </html>
  );
}
```

Then in another terminal, from your project root:

```bash
npx feedback-to-cli serve
```

Pins land in `.feedback-to-cli/<page>.md`. Add it to `.gitignore`.
