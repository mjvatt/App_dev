"""
Created on Wed Jan 14 20:08:35 2025

@author: Mike Vatt
"""

import tkinter as tk
import json
from tkinter import filedialog
import os
from PIL import Image, ImageTk

coaches = {
    "Jonathan Gannon": "ARI",
    "Raheem Morris": "ATL",
    "John Harbaugh": "BAL",
    "Sean McDermott": "BUF",
    "Dave Canales": "CAR",
    "Matt Eberflus": "CHI",
    "Zac Taylor": "CIN",
    "Kevin Stefanski": "CLE",
    "Mike McCarthy": "DAL",
    "Sean Payton": "DEN",
    "Dan Campbell": "DET",
    "Matt LaFleur": "GB",
    "DeMeco Ryans": "HOU",
    "Shane Steichen": "IND",
    "Doug Pederson": "JAX",
    "Andy Reid": "KC",
    "Antonio Pierce": "LVR",
    "Jim Harbaugh": "LAC",
    "Sean McVay": "LAR",
    "Mike McDaniel": "MIA",
    "Kevin O'Connell": "MIN",
    "Mike Vrabel": "TEN",
    "Dennis Allen": "NO",
    "Brian Daboll": "NYG",
    "Jeff Ulbrich": "NYJ",
    "Nick Sirianni": "PHI",
    "Mike Tomlin": "PIT",
    "Kyle Shanahan": "SF",
    "Mike Macdonald": "SEA",
    "Todd Bowles": "TB",
    "Brian Callahan": "TEN",
    "Dan Quinn": "WAS",
    "Urban Meyer": "UNEMP",
    "Deion Sanders": "UNEMP",
    "Jarod Mayo": "UNEMP",
    "Robert Saleh": "UNEMP"
}

class CoachRankingApp:
    def __init__(self, root):
        self.root = root
        root.title("NFL Coach Ranking")

        self.row_height = 40
        self.padding = 10
        self.num_coaches = len(coaches)
        self.canvas_width = 400

        # Need to update location of NFL Images
        self.image_dir = r"NFL Images"   

        self.nfl_logo_size = (100, 100)
        self.nfl_logo_height = self.nfl_logo_size[1] + self.padding * 2
        self.nfl_logo = None
        self.load_nfl_logo()

        self.team_images = {}
        self.load_images()

        self.canvas_height = self.nfl_logo_height + (self.num_coaches * self.row_height) + self.padding
        initial_window_height = min(self.canvas_height, 800) 
        self.canvas = tk.Canvas(root, width=self.canvas_width, height=initial_window_height, bg="#f0f0f0", scrollregion=(0, 0, self.canvas_width, self.canvas_height)) #set initial height
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.scrollbar = tk.Scrollbar(root, command=self.canvas.yview)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.canvas.config(yscrollcommand=self.scrollbar.set)

        self.coach_items = {}
        self.coach_order = list(coaches.keys())

        self.create_coach_items()
        self.draw_separators()

        self.canvas.bind("<Button-1>", self.on_drag_start)
        self.canvas.bind("<B1-Motion>", self.on_drag_motion)
        self.canvas.bind("<ButtonRelease-1>", self.on_drag_end)
        self.canvas.bind("<MouseWheel>", self.on_mousewheel)

        menubar = tk.Menu(root)
        filemenu = tk.Menu(menubar, tearoff=0)
        filemenu.add_command(label="Save", command=self.save_rankings)
        filemenu.add_command(label="Load", command=self.load_rankings)
        menubar.add_cascade(label="File", menu=filemenu)
        root.config(menu=menubar)

    def load_images(self):
        try:
            for filename in os.listdir(self.image_dir):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
                    team_name = os.path.splitext(filename)[0]
                    filepath = os.path.join(self.image_dir, filename)
                    image = Image.open(filepath).resize((30, 30), Image.LANCZOS)
                    photo = ImageTk.PhotoImage(image)
                    self.team_images[team_name] = photo
        except FileNotFoundError:
            print(f"Error: Image directory not found: {self.image_dir}")
        except Exception as e:
            print(f"Error loading images: {e}")

    def load_nfl_logo(self):
        try:
            nfl_logo_path = os.path.join(self.image_dir, "NFL.png")
            image = Image.open(nfl_logo_path).resize(self.nfl_logo_size, Image.LANCZOS)
            self.nfl_logo = ImageTk.PhotoImage(image)
        except FileNotFoundError:
            print(f"Error: NFL logo not found at: {nfl_logo_path}")
        except Exception as e:
            print(f"Error loading NFL logo: {e}")

    def create_coach_items(self):
        self.canvas.delete("coach_item", "nfl_logo")

        if self.nfl_logo:
            self.canvas.create_image(self.canvas_width // 2, self.nfl_logo_height // 2, anchor=tk.CENTER, image=self.nfl_logo, tags=("nfl_logo",))

        for i, coach in enumerate(self.coach_order):
            y = self.nfl_logo_height + self.padding + i * self.row_height + 15
            rank = self.canvas.create_text(self.padding + 10, y, text=f"{i + 1}.", anchor=tk.W, font=("Arial", 10), tags=("rank", "coach_item"))
            team = coaches[coach]
            text = self.canvas.create_text(self.padding + 90, y, text=f"{coach} - {team}", anchor=tk.W, font=("Arial", 10), tags=("text", "coach_item"))

            image = self.team_images.get(team)
            image_item = None
            if image:
                image_item = self.canvas.create_image(self.padding + 50, y, anchor=tk.CENTER, image=image, tags=("image", "coach_item"))
            else:
                print(f"Image not found for {team}")

            x1 = self.padding
            y1 = self.nfl_logo_height + self.padding + i * self.row_height
            x2 = 390 - self.padding
            y2 = y1 + self.row_height
            if i % 2 == 0:
                bg_color = "#e0f2f7"
            else:
                bg_color = "#f0f0f0"
            bg_rect = self.canvas.create_rectangle(x1, y1, x2, y2, fill=bg_color, outline="", tags=("bg", "coach_item"))
            self.canvas.tag_lower(bg_rect)

            self.coach_items[coach] = (rank, text, bg_rect, image_item)

    def draw_separators(self):
        self.canvas.delete("separator")
        for i in range(len(self.coach_order) + 1):
            y = self.nfl_logo_height + self.padding + i * self.row_height
            self.canvas.create_line(self.padding, y, 390 - self.padding, y, fill="#ddd", tags="separator")

    def on_drag_start(self, event):
        canvas_y = self.canvas.canvasy(event.y)
        item = self.canvas.find_closest(event.x, canvas_y)[0]
        for coach, items in self.coach_items.items():
            if item in items:
                self.dragged_coach = coach
                self.dragged_items = items
                self.start_y = canvas_y
                for i in items:
                    if i:
                        self.canvas.lift(i)
                break
        else:
            return

    def on_drag_motion(self, event):
        if hasattr(self, 'dragged_items'):
            canvas_y = self.canvas.canvasy(event.y)
            dy = canvas_y - self.start_y
            for i in self.dragged_items:
                if i:
                    self.canvas.move(i, 0, dy)
            self.start_y = canvas_y

    def on_drag_end(self, event):
        if hasattr(self, 'dragged_coach'):
            canvas_y = self.canvas.canvasy(event.y)
            target_row = int((canvas_y - self.nfl_logo_height - self.padding) // self.row_height)
            target_row = max(0, min(target_row, len(self.coach_order) - 1))

            current_index = self.coach_order.index(self.dragged_coach)

            if current_index != target_row:
                self.coach_order[current_index], self.coach_order[target_row] = self.coach_order[target_row], self.coach_order[current_index]
                self.update_display() 

            del self.dragged_coach
            del self.dragged_items
            del self.start_y

    def update_display(self):
        self.create_coach_items()
        self.draw_separators()
        self.canvas.update()

    def on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-1*(event.delta/120)), "units")

    def save_rankings(self):
        filename = filedialog.asksaveasfilename(defaultextension=".json",
                                                filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
                                                title="Save Rankings")
        if filename:
            try:
                with open(filename, "w") as f:
                    json.dump(self.coach_order, f)
                print(f"Rankings saved to {filename}")
            except Exception as e:
                print(f"Error saving rankings: {e}")

    def load_rankings(self):
        filename = filedialog.askopenfilename()
        if filename:
            try:
                with open(filename, "r") as f:
                    self.coach_order = json.load(f)
                print(f"Rankings loaded from {filename}")
                self.update_display()  

            except Exception as e:
                print(f"Error loading rankings: {e}")
        
root = tk.Tk()
app = CoachRankingApp(root)
root.mainloop()
