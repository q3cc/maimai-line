const state = {
  token: localStorage.getItem("maimai_line_token") || "",
  lastEntryId: ""
};

const $ = (id) => document.getElementById(id);

function payload() {
  return {
    email: $("email").value.trim(),
    username: $("username").value.trim(),
    password: $("password").value
  };
}

function headers() {
  return {
    "content-type": "application/json",
    ...(state.token ? { authorization: `Bearer ${state.token}` } : {})
  };
}

async function api(path, options = {}) {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw body;
  }
  return body;
}

function print(id, value) {
  $(id).textContent = JSON.stringify(value, null, 2);
}

$("registerBtn").addEventListener("click", async () => {
  try {
    const result = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload())
    });
    state.token = result.token;
    localStorage.setItem("maimai_line_token", state.token);
    print("authOutput", result);
  } catch (error) {
    print("authOutput", error);
  }
});

$("loginBtn").addEventListener("click", async () => {
  try {
    const login = payload();
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier: login.email || login.username,
        password: login.password
      })
    });
    state.token = result.token;
    localStorage.setItem("maimai_line_token", state.token);
    print("authOutput", result);
  } catch (error) {
    print("authOutput", error);
  }
});

$("loadArcadesBtn").addEventListener("click", async () => {
  try {
    print("queueOutput", await api("/arcades"));
  } catch (error) {
    print("queueOutput", error);
  }
});

$("loadQueueBtn").addEventListener("click", loadQueue);

$("joinBtn").addEventListener("click", async () => {
  try {
    const result = await api(`/queues/${$("queueId").value.trim()}/join`, {
      method: "POST",
      body: JSON.stringify({
        displayName: $("displayName").value,
        peopleCount: Number($("peopleCount").value),
        note: $("note").value
      })
    });
    state.lastEntryId = result.entryId;
    print("actionOutput", result);
    await loadQueue();
  } catch (error) {
    print("actionOutput", error);
  }
});

$("myStateBtn").addEventListener("click", async () => {
  try {
    const result = await api(`/queues/${$("queueId").value.trim()}/my-state`);
    state.lastEntryId = result.entry?.id || state.lastEntryId;
    print("actionOutput", result);
  } catch (error) {
    print("actionOutput", error);
  }
});

$("callNextBtn").addEventListener("click", async () => {
  try {
    const result = await api(`/queues/${$("queueId").value.trim()}/call-next`, {
      method: "POST",
      body: JSON.stringify({ timeoutSeconds: 180 })
    });
    state.lastEntryId = result.entryId;
    print("actionOutput", result);
    await loadQueue();
  } catch (error) {
    print("actionOutput", error);
  }
});

async function loadQueue() {
  try {
    print("queueOutput", await api(`/queues/${$("queueId").value.trim()}`));
  } catch (error) {
    print("queueOutput", error);
  }
}

loadQueue();
