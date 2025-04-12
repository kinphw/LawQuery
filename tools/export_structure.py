import os

def generate_file_tree(startpath, output_file):
    with open(output_file, 'w', encoding='utf-8') as f:
        for root, dirs, files in os.walk(startpath):
            # Skip node_modules and git directories
            if 'node_modules' in dirs:
                dirs.remove('node_modules')
            if '.git' in dirs:
                dirs.remove('.git')
                
            level = root.replace(startpath, '').count(os.sep)
            indent = '  ' * level
            f.write(f'{indent}{os.path.basename(root)}/\n')
            subindent = '  ' * (level + 1)
            for file in files:
                f.write(f'{subindent}{file}\n')

if __name__ == '__main__':
    # Change this line to go up one directory to project root
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_file = os.path.join(project_root, 'file_structure.txt')
    generate_file_tree(project_root, output_file)
    print(f"File structure has been saved to {output_file}")