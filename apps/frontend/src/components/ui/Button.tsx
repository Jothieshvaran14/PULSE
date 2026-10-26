import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn-danger",
    ghost: "btn-ghost",
    outline: "btn-secondary",
    success: "btn-primary",
  }[variant];

  const sizeClass = {
    sm: "btn-sm",
    md: "",
    lg: "btn-lg",
  }[size];

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 style={{ width: "14px", height: "14px", animation: "spin 0.8s linear infinite" }} />}
      {children}
    </button>
  );
}
