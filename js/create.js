document.addEventListener("DOMContentLoaded", () => {
    const newStoryBtn = document.getElementById("new-story-btn");
    const saveStoryBtn = document.getElementById("save-story-btn");
    const deleteStoryBtn = document.getElementById("delete-story-btn");
    const titleInput = document.getElementById("story-title-input");
    const editor = document.getElementById("editor-textarea");
    const storiesList = document.getElementById("stories-list");

    // Publish Modal Elements
    const publishModalBtn = document.getElementById("publish-modal-btn");
    const publishModal = document.getElementById("publish-modal");
    const cancelPublishBtn = document.getElementById("cancel-publish-btn");
    const confirmPublishBtn = document.getElementById("confirm-publish-btn");
    const modalTitleInput = document.getElementById("modal-title");
    const modalAuthorInput = document.getElementById("modal-author");
    const posterInput = document.getElementById("poster-input");
    const posterPreviewText = document.getElementById("poster-preview-text");

    let currentStoryId = null;
    let selectedPosterBase64 = "";

    // Load saved stories from browser storage on startup
    let stories = JSON.parse(localStorage.getItem("talehaven_stories")) || [];

    function renderStoriesList() {
        storiesList.innerHTML = "";
        stories.forEach(story => {
            const li = document.createElement("li");
            li.textContent = story.title || "Untitled Story";
            if (story.id === currentStoryId) {
                li.classList.add("active");
            }
            li.addEventListener("click", () => loadStory(story.id));
            storiesList.appendChild(li);
        });
    }

    function loadStory(id) {
        const story = stories.find(s => s.id === id);
        if (story) {
            currentStoryId = story.id;
            titleInput.value = story.title;
            editor.innerHTML = story.content;
            renderStoriesList();
        }
    }

    // "+ Create a Story" Button Clicked
    newStoryBtn.addEventListener("click", () => {
        currentStoryId = "story_" + Date.now();
        titleInput.value = "";
        editor.innerHTML = "";
        
        // Push a fresh blank draft into the array and render
        stories.push({ id: currentStoryId, title: "Untitled Story", content: "" });
        saveToLocalStorage();
        renderStoriesList();
        titleInput.focus();
    });

    // "Save" Button Clicked
    saveStoryBtn.addEventListener("click", () => {
        if (!currentStoryId) {
            // If no active story exists yet, create one automatically on save
            currentStoryId = "story_" + Date.now();
            stories.push({
                id: currentStoryId,
                title: titleInput.value.trim() || "Untitled Story",
                content: editor.innerHTML
            });
        } else {
            // Find and update the existing open story
            const story = stories.find(s => s.id === currentStoryId);
            if (story) {
                story.title = titleInput.value.trim() || "Untitled Story";
                story.content = editor.innerHTML;
            }
        }

        saveToLocalStorage();
        renderStoriesList();
        alert("Story saved successfully!");
    });

    // "Delete" Button Clicked (Updated to delete from Supabase and local storage)
    deleteStoryBtn.addEventListener("click", async () => {
        if (!currentStoryId) return;

        if (confirm("Are you sure you want to delete this story?")) {
            const storyToDelete = stories.find(s => s.id === currentStoryId);

            // 1. If it was published online, delete it from the Supabase database
            if (storyToDelete && storyToDelete.supabaseId) {
                const { error } = await window._supabase
                    .from('published_stories')
                    .delete()
                    .eq('id', storyToDelete.supabaseId);

                if (error) {
                    console.error("Error deleting from Supabase:", error);
                    alert("Failed to remove from online database, but local draft will be deleted.");
                }
            }

            // 2. Filter out the current story from local drafts
            stories = stories.filter(s => s.id !== currentStoryId);
            saveToLocalStorage();

            // 3. Check if there are remaining stories
            if (stories.length > 0) {
                loadStory(stories[0].id); // Load the first available story
            } else {
                // If list is completely empty, open a fresh blank template
                currentStoryId = null;
                titleInput.value = "";
                editor.innerHTML = "";
                renderStoriesList();
                newStoryBtn.click(); 
            }
        }
    });

    // --- PUBLISH MODAL LOGIC ---

    // Open Publish Modal
    publishModalBtn.addEventListener("click", () => {
        if (!currentStoryId) {
            alert("Please save or create a story first!");
            return;
        }
        // Sync the title from editor input (non-editable in modal)
        modalTitleInput.value = titleInput.value.trim() || "Untitled Story";
        
        // Reset genre checkboxes and poster preview when opening
        document.querySelectorAll('input[name="genre"]').forEach(cb => cb.checked = false);
        posterPreviewText.textContent = "Choose image file...";
        selectedPosterBase64 = "";

        publishModal.style.display = "flex";
    });

    // Close Modal on Cancel
    cancelPublishBtn.addEventListener("click", () => {
        publishModal.style.display = "none";
    });

    // Handle Poster Image Upload selection
    posterInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            posterPreviewText.textContent = file.name;
            const reader = new FileReader();
            reader.onload = function(uploadEvent) {
                selectedPosterBase64 = uploadEvent.target.result; // Converts image file to string for local storage
            };
            reader.readAsDataURL(file);
        }
    });

    // Confirm Publish Button Clicked (Updated to use upsert for updates)
    confirmPublishBtn.addEventListener("click", async () => {
        const selectedGenres = Array.from(document.querySelectorAll('input[name="genre"]:checked'))
            .map(cb => cb.value);

        if (selectedGenres.length === 0) {
            alert("Please select at least one genre.");
            return;
        }

        const currentStory = stories.find(s => s.id === currentStoryId);
        if (!currentStory) return;

        const storyPayload = {
            title: modalTitleInput.value,
            author: modalAuthorInput.value.trim() || "Anonymous",
            poster: selectedPosterBase64 || "",
            genres: selectedGenres,
            content: editor.innerHTML
        };

        // If this story already has a Supabase ID, include it so upsert updates the existing row
        if (currentStory.supabaseId) {
            storyPayload.id = currentStory.supabaseId;
        }

        // Use upsert to update if ID exists or insert if it's new
        const { data, error } = await window._supabase
            .from('published_stories')
            .upsert([storyPayload])
            .select();

        if (error) {
            console.error("Error publishing/updating to Supabase:", error);
            alert("Failed to publish online. Check console for details.");
            return;
        }

        // Save the cloud database row ID locally (in case it was a first-time publish)
        if (data && data.length > 0) {
            currentStory.supabaseId = data[0].id;
            saveToLocalStorage();
        }

        publishModal.style.display = "none";
        alert("Story successfully published/updated online for everyone to read!");
    });

    function saveToLocalStorage() {
        localStorage.setItem("talehaven_stories", JSON.stringify(stories));
    }

    // Initialize with a default view if stories exist
    if (stories.length > 0) {
        loadStory(stories[0].id);
    } else {
        newStoryBtn.click(); // Automatically open a blank template if list is empty
    }
});

// Text Formatting Function for Toolbar buttons
function formatText(command) {
    document.execCommand(command, false, null);
}
