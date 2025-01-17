# -*- coding: utf-8 -*-
"""
Created on Wed Jan 15 22:59:12 2025

@author: mjvat
"""

import sys
import os
from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QGraphicsScene, QGraphicsView, QGraphicsPixmapItem, QGraphicsTextItem,
    QGraphicsRectItem, QFileDialog, QMenuBar, QMenu, QAction
)
from PyQt5.QtCore import Qt, QPoint, QSize, QRectF
from PyQt5.QtGui import QPixmap, QBrush, QFont, QTransform
import json

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

class CoachRankingApp(QWidget):
    def __init__(self):
        super().__init__()
        self.init_ui()

    def init_ui(self):
        self.setWindowTitle("NFL Coach Ranking")

        self.row_height = 40
        self.padding = 10
        self.num_coaches = len(coaches)
        self.canvas_width = 400

        # Need to update to actual path of NFL Images
        self.image_dir = r"NFL Images"  

        self.nfl_logo_size = QSize(100, 100)
        self.nfl_logo_height = self.nfl_logo_size.height() + self.padding * 2
        self.nfl_logo = None
        self.load_nfl_logo()

        self.team_images = {}
        self.load_images()

        self.canvas_height = self.nfl_logo_height + (self.num_coaches * self.row_height) + self.padding
        initial_window_height = min(self.canvas_height, 800)

        self.graphics_scene = QGraphicsScene(0, 0, self.canvas_width, self.canvas_height)
        self.graphics_view = QGraphicsView(self.graphics_scene)
        self.graphics_view.setFixedSize(self.canvas_width, initial_window_height)
        self.graphics_view.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.graphics_view.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        self.coach_items = {}
        self.coach_order = list(coaches.keys())
        self.create_coach_items()
        self.draw_separators()

        self.dragged_coach = None
        self.dragged_items = None
        self.drag_start_y = None
        self.drag_offset = 0

        self.graphics_view.mousePressEvent = self.on_drag_start
        self.graphics_view.mouseMoveEvent = self.on_drag_motion
        self.graphics_view.mouseReleaseEvent = self.on_drag_end
        self.graphics_view.wheelEvent = self.on_mousewheel

        layout = QVBoxLayout(self)
        layout.addWidget(self.graphics_view)
        self.setLayout(layout)

        self.create_menu_bar()

    def showEvent(self, event):
        super().showEvent(event)
        # Ensure the scroll bar is set to the top after the widget is shown
        self.graphics_view.verticalScrollBar().setValue(0)
        
    def load_images(self):
        try:
            for filename in os.listdir(self.image_dir):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
                    team_name = os.path.splitext(filename)[0]
                    filepath = os.path.join(self.image_dir, filename)
                    image = QPixmap(filepath).scaled(30, 30, Qt.KeepAspectRatio)
                    self.team_images[team_name] = image
        except FileNotFoundError:
            print(f"Error: Image directory not found: {self.image_dir}")
        except Exception as e:
            print(f"Error loading images: {e}")

    def load_nfl_logo(self):
        try:
            nfl_logo_path = os.path.join(self.image_dir, "NFL.png")
            image = QPixmap(nfl_logo_path).scaled(self.nfl_logo_size, Qt.KeepAspectRatio)
            self.nfl_logo = image
        except FileNotFoundError:
            print(f"Error: NFL logo not found at: {nfl_logo_path}")
        except Exception as e:
            print(f"Error loading NFL logo: {e}")

    def create_coach_items(self):
        self.graphics_scene.clear()
        self.coach_items = {}

        if self.nfl_logo:
            pixmap_item = QGraphicsPixmapItem(self.nfl_logo)
            pixmap_item.setPos(self.canvas_width // 2 - self.nfl_logo.width() // 2, 0)
            self.graphics_scene.addItem(pixmap_item)

        for i, coach in enumerate(self.coach_order):
            y = self.nfl_logo_height + self.padding + i * self.row_height
            team = coaches[coach]

            bg_rect = QGraphicsRectItem(0, y, self.canvas_width, self.row_height)
            bg_rect.setBrush(QBrush(Qt.lightGray if i % 2 else Qt.white))
            self.graphics_scene.addItem(bg_rect)

            rank_text = QGraphicsTextItem(f"{i + 1}.")
            rank_text.setPos(self.padding + 10, y + 10)
            rank_text.setFont(QFont("Arial", 10))
            self.graphics_scene.addItem(rank_text)

            team_pixmap = self.team_images.get(team)
            if team_pixmap:
                team_item = QGraphicsPixmapItem(team_pixmap)
                team_item.setPos(self.padding + 50, y + 5)
                self.graphics_scene.addItem(team_item)
            else:
                team_item = None

            coach_text = QGraphicsTextItem(f"{coach} - {team}")
            coach_text.setPos(self.padding + 90, y + 10)
            coach_text.setFont(QFont("Arial", 10))
            self.graphics_scene.addItem(coach_text)

            self.coach_items[coach] = (rank_text, coach_text, bg_rect, team_item)

    def draw_separators(self):
        for i in range(len(self.coach_order) + 1):
            y = self.nfl_logo_height + self.padding + i * self.row_height
            line = self.graphics_scene.addLine(self.padding, y, self.canvas_width - self.padding, y, Qt.gray)
            line.setZValue(-1)

    def on_drag_start(self, event):
        scene_pos = self.graphics_view.mapToScene(event.pos())
        item = self.graphics_scene.itemAt(scene_pos, QTransform())
        self.dragged_coach = None
        self.dragged_items = None
    
        # Check if the clicked item belongs to a coach's row
        if item:
            for coach, items in self.coach_items.items():
                # If the clicked item is part of this coach's row
                if item in items:  
                    self.dragged_coach = coach
                    self.dragged_items = items
                    self.drag_start_y = scene_pos.y()
                    # Calculate correct offset
                    self.drag_offset = self.drag_start_y - items[2].scenePos().y()  
                    
                    # Bring all row items to the front
                    for i in self.dragged_items:
                        if i is not None:
                             # Set higher Z-value to bring to front
                            i.setZValue(1) 
                    break
    
    def on_drag_motion(self, event):
        if self.dragged_items is not None:
            scene_pos = self.graphics_view.mapToScene(event.pos())
            new_y = scene_pos.y() - self.drag_offset  # Use the offset to adjust the row position
            
            # Calculate the vertical delta to move all components together
            delta_y = new_y - self.dragged_items[2].scenePos().y()  # Base it on the background rectangle
            
            for item in self.dragged_items:
                if item is not None:
                    # Move all items by the same vertical delta
                    item.moveBy(0, delta_y)  
            self.graphics_scene.update()
    
    def on_drag_end(self, event):
        if self.dragged_items is not None and self.dragged_coach is not None:
            end_pos = self.graphics_view.mapToScene(event.pos())
            new_y = end_pos.y()
    
            # Calculate target index by comparing to row midpoints
            target_index = -1
            for i in range(len(self.coach_order)):
                row_midpoint = self.nfl_logo_height + self.padding + i * self.row_height + self.row_height / 2
                if new_y < row_midpoint:
                    target_index = i
                    break
    
            if target_index == -1:  # Move to last row if no match
                target_index = len(self.coach_order) - 1
    
            current_index = self.coach_order.index(self.dragged_coach)

            # Only move if necessary
            if current_index != target_index:  
                self.coach_order.insert(target_index, self.coach_order.pop(current_index))
                self.update_display()
    
        # Reset dragging state
        self.dragged_coach = None
        self.dragged_items = None
        self.drag_start_y = None
        self.drag_offset = 0


    def update_display(self):
        self.create_coach_items()
        self.draw_separators()

    def on_mousewheel(self, event):
        self.graphics_view.verticalScrollBar().setValue(self.graphics_view.verticalScrollBar().value() - event.angleDelta().y()//8)

    def create_menu_bar(self):
        menubar = QMenuBar(self)
        file_menu = QMenu("File", self)

        save_action = QAction("Save", self)
        save_action.triggered.connect(self.save_rankings)
        file_menu.addAction(save_action)

        load_action = QAction("Load", self)
        load_action.triggered.connect(self.load_rankings)
        file_menu.addAction(load_action)

        menubar.addMenu(file_menu)
        self.layout().setMenuBar(menubar)

    def save_rankings(self):
        filename = QFileDialog.getSaveFileName(self, "Save Rankings", "", "JSON Files (*.json);;All Files (*)")
        if filename[0]:
            try:
                with open(filename[0], "w") as f:
                    json.dump(self.coach_order, f)
                print(f"Rankings saved to {filename[0]}")
            except Exception as e:
                print(f"Error saving rankings: {e}")

    def load_rankings(self):
        filename = QFileDialog.getOpenFileName(self, "Load Rankings", "", "JSON Files (*.json);;All Files (*)")
        if filename[0]:
            try:
                with open(filename[0], "r") as f:
                    self.coach_order = json.load(f)
                print(f"Rankings loaded from {filename[0]}")
                self.update_display()
            except Exception as e:
                print(f"Error loading rankings: {e}")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = CoachRankingApp()
    window.show()
    sys.exit(app.exec_())
