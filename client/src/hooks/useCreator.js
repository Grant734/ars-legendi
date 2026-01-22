import { useState } from "react";

// Set your own secret password here
const CREATOR_PASSWORD = "latinisawesome";

export default function useCreator() {
  const [isCreator, setIsCreator] = useState(() => {
    return localStorage.getItem("isCreator") === "true";
  });

  const login = () => {
    const password = window.prompt("Enter creator password:");
    if (password === CREATOR_PASSWORD) {
      localStorage.setItem("isCreator", "true");
      setIsCreator(true);
    } else {
      alert("Incorrect password. Access denied.");
    }
  };

  const logout = () => {
    localStorage.removeItem("isCreator");
    setIsCreator(false);
  };

  return { isCreator, login, logout };
}
