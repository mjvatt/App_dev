# -*- coding: utf-8 -*-
"""
Created on Tue Mar  5 21:59:10 2024

@author: Mike Vatt
"""

import os
import tkinter as tk
from tkinter import filedialog,ttk

class FileExtensionConverter:
    
    def __init__(self, window=None):
        
        self.window = tk.Tk()
        self.window.title("File Extension Converter")

        # Input fields
        tk.Label(self.window, text="File Path:").grid(row=0, column=0)
        self.filepath_entry = tk.Entry(self.window)
        self.filepath_entry.grid(row=0, column=1)
        tk.Button(self.window, text="Browse", command=self.runTwoCommands).grid(row=0, column=2)

        tk.Label(self.window, text="New Desired Extension:").grid(row=1, column=0)
        self.newext_entry = tk.Entry(self.window)
        self.newext_entry.grid(row=1, column=1)

        # Add label to show current file extensions
        tk.Label(self.window, text="Current File Extensions in File Path").grid(row=2, column=0)
        
        # Drop-down setup
        extensions = [".json", ".pdf", ".txt", ".csv"]  # Add your desired extensions
        self.selected_extension = tk.StringVar(self.window)
        self.selected_extension.set(extensions[0])  # Default selection
              
        extension_dropdown = ttk.Combobox(self.window, textvariable=self.selected_extension, values=extensions, state="readonly")
        extension_dropdown.grid(row=1, column=1)

        # Convert button and status label
        self.convert_button = tk.Button(self.window, text="Convert", command=self.convert_files)
        self.convert_button.grid(row=3, column=1)
        self.status_label = tk.Label(self.window, text="")
        self.status_label.grid(row=4, column=1)

        # Convert the file extensions:
        convert_button = tk.Button(self.window, text="Convert Files", command=self.convert_files)
        convert_button.grid(row=3, column=1)  # Place the button in your layout
        
        self.window.mainloop()

    def get_filepath(self):
        
        self.folder_path = filedialog.askdirectory()
        self.filepath_entry.insert(0, self.folder_path) 
        
    def runTwoCommands(self):
        
        self.get_filepath()
        self.show_file_extension()
        
    def show_file_extension(self):
        
        self.files = os.listdir(self.folder_path)
        filename = self.files[0]
        if filename:
            _, file_extension = os.path.splitext(filename)
            extension_label = tk.Label(self.window, text=file_extension)
            extension_label.grid(row=3, column=0) # Place below existing widgets
    
    def convert_files(self):
        
        self.newExtension = self.selected_extension.get()
        print(self.newExtension)
        
        if not self.folder_path:  # Check if a file path has been selected
            tk.messagebox.showerror("Error", "Please select a file path first.")
            return
    
        try:
            for file in self.files:
                self.base_name = os.path.splitext(file)[0]
                self.new_name = self.base_name + self.newExtension
                old_filepath = os.path.join(self.folder_path, file)
                new_filepath = os.path.join(self.folder_path, self.new_name)
                os.rename(old_filepath, new_filepath)
    
            tk.messagebox.showinfo("Success", "Conversion successful!")
        except Exception as e:
            tk.messagebox.showerror("Error", f"Conversion failed: {e}")

if __name__ == '__main__':
    
    converter = FileExtensionConverter()
