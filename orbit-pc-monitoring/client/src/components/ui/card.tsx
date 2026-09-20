import * as React from "react";

const cardBase: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.09)",
  borderRadius: "16px",
  background: "linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.018))",
  boxShadow: "0 14px 36px rgba(0,0,0,.16)",
};

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => <div ref={ref} style={{ ...cardBase, ...style }} {...props} />
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ padding: "20px 22px 0", ...style }} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ style, ...props }, ref) => (
    <h3 ref={ref} style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 500, color: "#eae7df", letterSpacing: "-.03em", ...style }} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ style, ...props }, ref) => (
    <p ref={ref} style={{ margin: 0, fontSize: "11px", color: "#858d8e", ...style }} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ padding: "16px 22px", ...style }} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ padding: "0 22px 20px", display: "flex", alignItems: "center", ...style }} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
