import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: { background: "#f78265", color: "#241916", border: "none" },
  destructive: { background: "#f78265", color: "#fff", border: "none" },
  outline: { background: "transparent", color: "#d8d6d0", border: "1px solid rgba(255,255,255,.15)" },
  secondary: { background: "rgba(255,255,255,.07)", color: "#d8d6d0", border: "none" },
  ghost: { background: "transparent", color: "#d8d6d0", border: "none" },
  link: { background: "transparent", color: "#f78265", border: "none", textDecoration: "underline" },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  default: { padding: "9px 14px", fontSize: "11px", borderRadius: "8px" },
  sm: { padding: "6px 10px", fontSize: "10px", borderRadius: "6px" },
  lg: { padding: "12px 18px", fontSize: "13px", borderRadius: "10px" },
  icon: { padding: "8px", width: "34px", height: "34px", borderRadius: "8px", display: "grid", placeItems: "center" },
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "opacity .15s",
          ...variantStyles[variant],
          ...sizeStyles[size],
          ...style,
        }}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
