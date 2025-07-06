import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import generatePassword from "../utils/generatePassword";
import Button from "./Button.jsx";

const ShareLinkModal = ({
  groupId,
  url: propUrl,
  visibility = "private",
  requireAuth = false,
  requirePassword = false,
  password = "",
  onClose,
  onUpdate,
}) => {
  const [currentVisibility, setCurrentVisibility] = useState(visibility);
  const [access, setAccess] = useState(requireAuth ? "auth" : "any");
  const [needPw, setNeedPw] = useState(requirePassword);
  const [pw, setPw] = useState(password);

  const url =
    propUrl || (groupId ? `${window.location.origin}/review/${groupId}` : "");

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => window.alert("Link copied to clipboard"))
      .catch((err) => console.error("Failed to copy link", err));
  };

  const saveSettings = async (
    vis = currentVisibility,
    acc = access,
    pwReq = needPw,
    pwVal = pw,
  ) => {
    if (!groupId) return;
    const update = {
      visibility: vis,
      requireAuth: acc === "auth",
      requirePassword: acc === "any" ? pwReq : false,
      password: acc === "any" && pwReq ? pwVal : "",
    };
    try {
      await updateDoc(doc(db, "adGroups", groupId), update);
      onUpdate && onUpdate(update);
    } catch (err) {
      console.error("Failed to update visibility", err);
    }
  };

  const toggleVisibility = async () => {
    if (currentVisibility === "public") {
      setCurrentVisibility("private");
      await saveSettings("private", "any", false, "");
      setAccess("any");
      setNeedPw(false);
      setPw("");
    } else {
      let newPw = pw;
      if (access === "any" && needPw && !newPw) newPw = generatePassword();
      setCurrentVisibility("public");
      setPw(newPw);
      await saveSettings("public", access, needPw, newPw);
    }
  };

  const handleAccessChange = async (e) => {
    const val = e.target.value;
    setAccess(val);
    if (currentVisibility === "public") {
      await saveSettings(
        currentVisibility,
        val,
        val === "any" ? needPw : false,
        pw,
      );
    }
  };

  const handlePwToggle = async () => {
    const newVal = !needPw;
    setNeedPw(newVal);
    let newPw = pw;
    if (newVal && !newPw) newPw = generatePassword();
    setPw(newPw);
    if (currentVisibility === "public" && access === "any") {
      await saveSettings(currentVisibility, access, newVal, newPw);
    }
  };

  const handleGenerate = async () => {
    const newPw = generatePassword();
    setPw(newPw);
    if (currentVisibility === "public" && access === "any" && needPw) {
      await saveSettings(currentVisibility, access, true, newPw);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-sm w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <h3 className="mb-2 font-semibold">Public Review</h3>
        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={currentVisibility === "public"}
            onChange={toggleVisibility}
          />
          Enable Public Review
        </label>
        {currentVisibility === "public" && (
          <>
            <label className="block mb-3 text-sm">
              Who can access this link?
              <select
                value={access}
                onChange={handleAccessChange}
                className="mt-1 w-full border rounded p-1 text-black dark:text-black"
              >
                <option value="any">Anyone with the link</option>
                <option value="auth">Only authenticated users</option>
              </select>
            </label>
            {access === "any" && (
              <>
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={needPw}
                    onChange={handlePwToggle}
                  />
                  Require password
                </label>
                {needPw && (
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={pw}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setPw(val);
                        if (
                          currentVisibility === "public" &&
                          access === "any"
                        ) {
                          await saveSettings(
                            currentVisibility,
                            access,
                            true,
                            val,
                          );
                        }
                      }}
                      className="flex-1 border rounded p-1 text-black dark:text-black"
                    />
                    <Button
                      onClick={handleGenerate}
                      variant="secondary"
                      className="px-2 py-1"
                    >
                      Generate Password
                    </Button>
                  </div>
                )}
              </>
            )}
            <Button onClick={copy} variant="primary" className="mb-3 px-3 py-1">
              Copy Link
            </Button>
          </>
        )}
        <div className="text-right">
          <Button onClick={onClose} variant="secondary" className="px-3 py-1">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShareLinkModal;
