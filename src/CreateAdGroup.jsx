// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase/config";

const CreateAdGroup = ({ showSidebar = true }) => {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [brandCodes, setBrandCodes] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCodes = async () => {
      if (!auth.currentUser?.uid) {
        setBrandCodes([]);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const codes = snap.exists() ? snap.data().brandCodes : [];
        if (Array.isArray(codes)) {
          setBrandCodes(codes);
        } else {
          setBrandCodes([]);
        }
      } catch (err) {
        console.error("Failed to fetch brand codes", err);
        setBrandCodes([]);
      }
    };
    fetchCodes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const groupName = name.trim() || `Group ${Date.now()}`;
    try {
      const docRef = await addDoc(collection(db, "adGroups"), {
        name: groupName,
        brandCode: brand.trim(),
        notes: notes.trim(),
        uploadedBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        status: "pending",
        reviewedCount: 0,
        approvedCount: 0,
        editCount: 0,
        rejectedCount: 0,
        thumbnailUrl: "",
        lastUpdated: serverTimestamp(),
        visibility: "private",
        requireAuth: false,
        requirePassword: false,
        password: "",
      });
      navigate(`/ad-group/${docRef.id}`);
    } catch (err) {
      console.error("Failed to create ad group", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto mt-10">
      <h1 className="text-2xl mb-4">Create Ad Group</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 text-sm font-medium">Group Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Brand</label>
          {brandCodes.length > 0 ? (
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full p-2 border rounded"
              required
            >
              <option value="">Select brand</option>
              {brandCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-500">No brands assigned</p>
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2 border rounded"
            rows={3}
            placeholder="Optional"
          />
        </div>
        <button type="submit" className="w-full btn-primary" disabled={loading}>
          {loading ? "Creating..." : "Create Group"}
        </button>
      </form>
    </div>
  );
};

export default CreateAdGroup;
