"use client";

import { useEffect, useState } from "react";
import {
  createHousehold,
  getMyHousehold,
  getMyHouseholdMembers,
  joinHouseholdByCode,
  type HouseholdMemberRow,
  type HouseholdRow,
} from "../lib/households-db";

export default function HouseholdTestPage() {
  const [householdName, setHouseholdName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("Ready");
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [members, setMembers] = useState<HouseholdMemberRow[]>([]);

  async function refreshData() {
    try {
      const currentHousehold = await getMyHousehold();
      setHousehold(currentHousehold);

      if (currentHousehold) {
        const currentMembers = await getMyHouseholdMembers();
        setMembers(currentMembers);
      } else {
        setMembers([]);
      }
    } catch (error) {
      const message =
  error instanceof Error ? error.message : JSON.stringify(error);
setStatus(`Load failed: ${message}`);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

async function handleCreateHousehold() {
  if (!householdName.trim()) {
    setStatus("Enter a household name");
    return;
  }

  try {
    setStatus("Creating household...");
    const created = await createHousehold(householdName);
    setHouseholdName("");
    await refreshData();
    setStatus(`Household created: ${created.name} (${created.join_code})`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : JSON.stringify(error);

    console.log("CREATE HOUSEHOLD ERROR:", error);
    setStatus(`Create failed: ${message}`);
  }
}

  async function handleJoinHousehold() {
    if (!joinCode.trim()) {
      setStatus("Enter a join code");
      return;
    }

    try {
      setStatus("Joining household...");
      await joinHouseholdByCode(joinCode);
      setJoinCode("");
      await refreshData();
      setStatus("Joined household");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to join household"
      );
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <h1>Household test</h1>

      <p>Status: {status}</p>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #444" }}>
        <h2>Create household</h2>
        <input
          type="text"
          placeholder="Household name"
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
        <button onClick={handleCreateHousehold}>Create household</button>
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #444" }}>
        <h2>Join household</h2>
        <input
          type="text"
          placeholder="Join code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
        <button onClick={handleJoinHousehold}>Join by code</button>
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #444" }}>
        <h2>Current household</h2>

        {household ? (
          <div>
            <p>Name: {household.name}</p>
            <p>Join code: {household.join_code}</p>
            <p>Owner user id: {household.owner_user_id}</p>

            <h3>Members</h3>
            {members.length > 0 ? (
              <ul>
                {members.map((member) => (
                  <li key={member.id}>
                    {member.user_id} — {member.role}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No members found.</p>
            )}
          </div>
        ) : (
          <p>You are not currently in a household.</p>
        )}
      </div>
    </div>
  );
}