import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import Login from "./Login";

const Index = () => {
  const { user } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "admin") navigate("/admin", { replace: true });
    else if (user?.role === "viewer") navigate("/viewer", { replace: true });
  }, [user, navigate]);

  return <Login />;
};

export default Index;
